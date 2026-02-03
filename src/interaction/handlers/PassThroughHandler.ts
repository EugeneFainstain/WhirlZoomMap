import { MapProvider } from '../../map/types';
import { InteractionHandler } from '../types';
import { TrailVisualizer } from '../../visualization/TrailVisualizer';
import { EdgeIndicator } from '../../visualization/EdgeIndicator';

interface PointerState {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  lastTime: number;
}

interface VelocitySample {
  vx: number;
  vy: number;
  time: number;
}

export class PassThroughHandler implements InteractionHandler {
  private pointers: Map<number, PointerState> = new Map();
  private visualizer: TrailVisualizer | null = null;
  private edgeIndicator: EdgeIndicator | null = null;

  // Drag anchor - the geographic coordinate that should stay under the cursor during drag
  private dragAnchorCoord: { lat: number; lng: number } | null = null;

  // Inertia state
  private velocitySamples: VelocitySample[] = [];
  private readonly maxVelocitySamples = 5;
  private inertiaAnimationId: number | null = null;
  private readonly friction = 0.95; // Deceleration factor per frame
  private readonly minVelocity = 0.5; // Stop when velocity drops below this

  // Track the centroid of two-finger gestures for panning
  private lastTwoFingerCentroid: { x: number; y: number } | null = null;


  // Track if zoom threshold has been crossed during current drag
  private zoomActivated: boolean = false;
  private alt1ZoomActivated: boolean = false;

  // Alt1 mode: use compound zoom value instead of signed area
  private alt1Mode: boolean = false;

  // Viewport element for consistent bounds calculations
  private viewport: HTMLElement | null = null;

  setVisualizer(visualizer: TrailVisualizer | null): void {
    this.visualizer = visualizer;
  }

  setEdgeIndicator(edgeIndicator: EdgeIndicator | null): void {
    this.edgeIndicator = edgeIndicator;
  }

  setAlt1Mode(enabled: boolean): void {
    this.alt1Mode = enabled;
  }

  private getCoordinateAtScreenPoint(mapProvider: MapProvider, clientX: number, clientY: number): { lat: number; lng: number } | null {
    // We need to access the underlying map to convert screen coordinates to geographic coordinates
    // This is a bit of a hack, but we'll cast to AppleMapProvider
    const provider = mapProvider as any;
    if (provider.map && provider.container) {
      // clientX/clientY are already page coordinates (viewport-relative)
      const domPoint = new DOMPoint(clientX, clientY);
      const coord = provider.map.convertPointOnPageToCoordinate(domPoint);
      return { lat: coord.latitude, lng: coord.longitude };
    }
    return null;
  }

  private positionCoordinateAtScreenPoint(
    mapProvider: MapProvider,
    coord: { lat: number; lng: number },
    clientX: number,
    clientY: number
  ): void {
    const provider = mapProvider as any;
    if (!provider.map || !provider.container) return;

    // clientX/clientY are already page coordinates
    const targetPageX = clientX;
    const targetPageY = clientY;

    // Get where this coordinate currently appears on screen
    const mapkit = (window as any).mapkit;
    const mapkitCoord = new mapkit.Coordinate(coord.lat, coord.lng);
    const currentPagePoint = provider.map.convertCoordinateToPointOnPage(mapkitCoord);

    // Calculate how much we need to pan
    const panPixelsX = currentPagePoint.x - targetPageX;
    const panPixelsY = currentPagePoint.y - targetPageY;

    // Apply the pan
    mapProvider.panBy(panPixelsX, panPixelsY);
  }

  onPointerDown(e: PointerEvent, mapProvider: MapProvider, viewport: HTMLElement): void {
    this.viewport = viewport;
    // Stop any ongoing inertia animation
    this.stopInertia();
    this.velocitySamples = [];

    this.pointers.set(e.pointerId, {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      lastTime: performance.now(),
    });

    // When transitioning to two-finger mode, reset centroid tracking
    if (this.pointers.size === 2) {
      this.lastTwoFingerCentroid = null;
    }

    // For single pointer drag, remember the geographic coordinate under the cursor
    if (this.pointers.size === 1) {
      this.zoomActivated = false; // Reset zoom activation for new drag
      this.alt1ZoomActivated = false; // Reset Alt1 zoom activation for new drag
      if (this.visualizer) {
        this.visualizer.setZoomActivated(false);
        this.visualizer.setAlt1ZoomActivated(false);
      }
      const coord = this.getCoordinateAtScreenPoint(mapProvider, e.clientX, e.clientY);
      if (coord) {
        this.dragAnchorCoord = coord;
      }
    }

    // Add initial point to visualizer and clear any virtual touch point
    if (this.visualizer && this.pointers.size === 1) {
      this.visualizer.clearVirtualTouchPoint();
      this.visualizer.clear();
      this.visualizer.addPoint(e.clientX, e.clientY);
    }
  }

  onPointerMove(e: PointerEvent, mapProvider: MapProvider, viewport: HTMLElement): void {
    this.viewport = viewport;
    const pointer = this.pointers.get(e.pointerId);
    if (!pointer) return;

    const now = performance.now();

    if (this.pointers.size === 1) {
      // Single pointer: drag with zoom based on signed area

      // Add point to visualizer first
      if (this.visualizer) {
        this.visualizer.addPoint(e.clientX, e.clientY);
      }

      // Calculate time delta in seconds
      const dt = (now - pointer.lastTime) / 1000;

      // Get signed area and calculate zoom rate
      let zoomDelta = 0;
      if (this.visualizer && dt > 0) {
        if (this.alt1Mode) {
          // Alt1 mode: use compound zoom value with thresholding
          const compoundValue = this.visualizer.getCompoundZoomValue();
          const threshold = this.visualizer.getAlt1Threshold();

          // Check if we should activate Alt1 zoom mode (crossing the threshold)
          if (!this.alt1ZoomActivated && Math.abs(compoundValue) > threshold) {
            this.alt1ZoomActivated = true;
            this.visualizer.setAlt1ZoomActivated(true);
          }

          // Once Alt1 zoom is activated, use compound value as zoom rate
          if (this.alt1ZoomActivated) {
            const rect = viewport.getBoundingClientRect();
            const minViewportDimension = Math.min(rect.width, rect.height);
            const normalizedValue = Math.sqrt(Math.abs(compoundValue)) / minViewportDimension * Math.sign(compoundValue);

            const zoomRate = normalizedValue * this.visualizer.getZoomRateCoeff();
            zoomDelta = zoomRate * dt;
          }
        } else {
          // Normal mode: use signed area with threshold
          const signedArea = this.visualizer.getSignedArea();
          const threshold = this.visualizer.getAreaThreshold();

          // Check if we should activate zoom mode (crossing the threshold)
          if (!this.zoomActivated && Math.abs(signedArea) > threshold) {
            this.zoomActivated = true;
            this.visualizer.setZoomActivated(true);
          }

          // Once zoom is activated, use area as zoom rate
          if (this.zoomActivated) {
            // Normalize by sqrt(area) vs minimal viewport dimension
            const rect = viewport.getBoundingClientRect();
            const minViewportDimension = Math.min(rect.width, rect.height);
            const normalizedValue = Math.sqrt(Math.abs(signedArea)) / minViewportDimension * Math.sign(signedArea);

            // Convert normalized value to zoom rate
            const zoomRate = normalizedValue * this.visualizer.getZoomRateCoeff();
            zoomDelta = zoomRate * dt;
          }
        }
      }

      // Apply zoom first if needed
      if (Math.abs(zoomDelta) > 0.0001) {
        const rect = viewport.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        mapProvider.zoomAtPoint(x, y, zoomDelta);
      }

      // Position the drag anchor coordinate at the current cursor position
      if (this.dragAnchorCoord) {
        this.positionCoordinateAtScreenPoint(mapProvider, this.dragAnchorCoord, e.clientX, e.clientY);
      }

      // Track velocity for inertia
      if (dt > 0) {
        const vx = (e.clientX - pointer.lastX) / (dt * 1000);
        const vy = (e.clientY - pointer.lastY) / (dt * 1000);
        this.velocitySamples.push({ vx, vy, time: now });
        // Keep only recent samples
        if (this.velocitySamples.length > this.maxVelocitySamples) {
          this.velocitySamples.shift();
        }
      }

      // Update edge indicator based on finger position
      if (this.edgeIndicator) {
        this.edgeIndicator.update(e.clientX, e.clientY, true);
      }
    }

    // Update pointer position BEFORE handling multi-touch gestures
    pointer.lastX = e.clientX;
    pointer.lastY = e.clientY;
    pointer.lastTime = now;

    // Two-finger gestures: pinch zoom, rotation, and panning
    if (this.pointers.size === 2) {
      const pointerArray = Array.from(this.pointers.values());
      const p1 = pointerArray[0];
      const p2 = pointerArray[1];

      // Calculate centroid for panning (zoom and rotate are handled natively)
      const centroidX = (p1.lastX + p2.lastX) / 2;
      const centroidY = (p1.lastY + p2.lastY) / 2;

      // Apply panning
      if (this.lastTwoFingerCentroid) {
        const panDx = centroidX - this.lastTwoFingerCentroid.x;
        const panDy = centroidY - this.lastTwoFingerCentroid.y;

        if (Math.abs(panDx) > 0.1 || Math.abs(panDy) > 0.1) {
          mapProvider.panBy(-panDx, -panDy);
        }
      }

      // Update tracking values for next frame
      this.lastTwoFingerCentroid = { x: centroidX, y: centroidY };
    }
  }

  onPointerUp(e: PointerEvent, mapProvider: MapProvider): void {
    const wasSinglePointer = this.pointers.size === 1;
    const wasMultiPointer = this.pointers.size > 1;
    const pointer = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);

    // Clear two-finger tracking when leaving two-finger mode
    if (wasMultiPointer && this.pointers.size < 2) {
      this.lastTwoFingerCentroid = null;
    }

    // When transitioning from multi-finger to single-finger, update the drag anchor
    // to prevent the map from jumping to the old anchor position
    if (wasMultiPointer && this.pointers.size === 1) {
      const remainingPointer = this.pointers.values().next().value;
      if (remainingPointer) {
        const coord = this.getCoordinateAtScreenPoint(mapProvider, remainingPointer.lastX, remainingPointer.lastY);
        if (coord) {
          this.dragAnchorCoord = coord;
        }
      }
    }

    // Clear drag anchor when all pointers are released
    if (this.pointers.size === 0) {
      this.dragAnchorCoord = null;
    }

    // When releasing from single-pointer drag
    if (wasSinglePointer && this.pointers.size === 0 && this.visualizer && pointer) {
      // Clear the drag point and set virtual touch point at the release position
      this.visualizer.clearDragPoint();
      this.visualizer.setVirtualTouchPoint(pointer.lastX, pointer.lastY);
    }

    // Hide edge indicator when drag ends
    if (wasSinglePointer && this.pointers.size === 0 && this.edgeIndicator) {
      this.edgeIndicator.hide();
    }

    // Clear visualizer trail and drag point when all pointers are released (but not during inertia)
    if (this.pointers.size === 0 && this.visualizer && !wasSinglePointer) {
      this.visualizer.clear();
    }

    // Start inertia only if we were single-finger panning and now have no pointers
    if (wasSinglePointer && this.pointers.size === 0) {
      this.startInertia(mapProvider);
    }
  }

  onWheel(e: WheelEvent, mapProvider: MapProvider): void {
    // Normalize wheel delta to a zoom increment
    const zoomDelta = -e.deltaY * 0.002;
    // Use offsetX/offsetY which are already relative to the target element
    mapProvider.zoomAtPoint(e.offsetX, e.offsetY, zoomDelta);
  }

  stopInertia(): void {
    if (this.inertiaAnimationId !== null) {
      cancelAnimationFrame(this.inertiaAnimationId);
      this.inertiaAnimationId = null;
    }

    // Clear virtual touch point when inertia stops
    if (this.visualizer) {
      this.visualizer.clearVirtualTouchPoint();
    }
  }

  private startInertia(mapProvider: MapProvider): void {
    // Need at least 2 samples to calculate velocity
    if (this.velocitySamples.length < 2) {
      this.velocitySamples = [];
      return;
    }

    // Only use recent samples (within last 100ms)
    const now = performance.now();
    const recentSamples = this.velocitySamples.filter(s => now - s.time < 100);

    if (recentSamples.length < 2) {
      this.velocitySamples = [];
      return;
    }

    // Calculate weighted average velocity (more recent = higher weight)
    let totalWeight = 0;
    let avgVx = 0;
    let avgVy = 0;

    for (let i = 0; i < recentSamples.length; i++) {
      const weight = i + 1; // Later samples get higher weight
      avgVx += recentSamples[i].vx * weight;
      avgVy += recentSamples[i].vy * weight;
      totalWeight += weight;
    }

    avgVx /= totalWeight;
    avgVy /= totalWeight;

    // Calculate average time delta between samples to determine actual pointer event frequency
    let totalDt = 0;
    for (let i = 1; i < recentSamples.length; i++) {
      totalDt += recentSamples[i].time - recentSamples[i - 1].time;
    }
    const avgDt = totalDt / (recentSamples.length - 1);

    // Convert from pixels/ms to pixels/frame using actual pointer event frequency
    // This ensures inertia speed matches the actual drag speed
    let vx = avgVx * avgDt;
    let vy = avgVy * avgDt;

    this.velocitySamples = [];

    // Check if velocity is significant enough to animate
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed < this.minVelocity) {
      return;
    }

    const animate = () => {
      // Apply velocity (negative because panBy moves the map opposite to finger direction)
      mapProvider.panBy(-vx, -vy);

      // Update virtual touch point to follow the map movement
      if (this.visualizer) {
        this.visualizer.updateVirtualTouchPoint(-vx, -vy);
      }

      // Apply friction
      vx *= this.friction;
      vy *= this.friction;

      // Check if we should continue
      const currentSpeed = Math.sqrt(vx * vx + vy * vy);
      if (currentSpeed > this.minVelocity) {
        this.inertiaAnimationId = requestAnimationFrame(animate);
      } else {
        this.inertiaAnimationId = null;
        // Don't clear virtual touch point here - let it persist for 2 seconds
      }
    };

    this.inertiaAnimationId = requestAnimationFrame(animate);
  }
}
