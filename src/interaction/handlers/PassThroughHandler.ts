import { MapProvider } from '../../map/types';
import { InteractionHandler } from '../types';
import { TrailVisualizer } from '../../visualization/TrailVisualizer';

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
  private lastPinchDistance: number | null = null;
  private lastPinchAngle: number | null = null;
  private visualizer: TrailVisualizer | null = null;

  // Drag anchor - the geographic coordinate that should stay under the cursor during drag
  private dragAnchorCoord: { lat: number; lng: number } | null = null;

  // Inertia state
  private velocitySamples: VelocitySample[] = [];
  private readonly maxVelocitySamples = 5;
  private inertiaAnimationId: number | null = null;
  private readonly friction = 0.95; // Deceleration factor per frame
  private readonly minVelocity = 0.5; // Stop when velocity drops below this

  // Pinch gesture throttling - only process once per frame
  private pinchScheduled = false;

  // Track the centroid of two-finger gestures for panning
  private lastTwoFingerCentroid: { x: number; y: number } | null = null;

  setVisualizer(visualizer: TrailVisualizer | null): void {
    this.visualizer = visualizer;
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

  onPointerDown(e: PointerEvent, mapProvider: MapProvider): void {
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

    // Reset pinch state when transitioning to 2 fingers
    // This prevents tiny movements during tap from causing zoom
    if (this.pointers.size === 2) {
      this.lastPinchDistance = null;
      this.lastPinchAngle = null;
      this.lastTwoFingerCentroid = null;
    }

    // For single pointer drag, remember the geographic coordinate under the cursor
    if (this.pointers.size === 1) {
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

  onPointerMove(e: PointerEvent, mapProvider: MapProvider): void {
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
        const signedArea = this.visualizer.getSignedArea();

        // Normalize by sqrt(area) vs minimal viewport dimension
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        const minViewportDimension = Math.min(rect.width, rect.height);
        const normalizedValue = Math.sqrt(Math.abs(signedArea)) / minViewportDimension * Math.sign(signedArea);

        // Convert normalized value to zoom rate
        const zoomRatePerNormalizedValuePerSecond = 20; // Adjust this for sensitivity
        const zoomRate = normalizedValue * zoomRatePerNormalizedValuePerSecond;
        zoomDelta = zoomRate * dt;
      }

      // Apply zoom first if needed
      if (Math.abs(zoomDelta) > 0.0001) {
        const rect = (e.target as HTMLElement).getBoundingClientRect();
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
    }

    // Update pointer position BEFORE handling multi-touch gestures
    // This ensures pinch calculations use current positions, not stale ones
    pointer.lastX = e.clientX;
    pointer.lastY = e.clientY;
    pointer.lastTime = now;

    // Handle two-finger gestures with updated positions
    if (this.pointers.size === 2) {
      // Two pointers: pinch zoom + rotate
      this.handlePinchAndRotate(e, mapProvider);
    }
  }

  onPointerUp(e: PointerEvent, mapProvider: MapProvider): void {
    const wasSinglePointer = this.pointers.size === 1;
    const pointer = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);

    if (this.pointers.size < 2) {
      this.lastPinchDistance = null;
      this.lastPinchAngle = null;
      this.lastTwoFingerCentroid = null;
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

  private handlePinchAndRotate(e: PointerEvent, mapProvider: MapProvider): void {
    // Throttle pinch calculations to once per animation frame
    // This prevents processing each finger's movement separately
    if (this.pinchScheduled) {
      return;
    }

    this.pinchScheduled = true;
    requestAnimationFrame(() => {
      this.pinchScheduled = false;
      this.processPinchAndRotate(mapProvider, e.target as HTMLElement);
    });
  }

  private processPinchAndRotate(mapProvider: MapProvider, target: HTMLElement): void {
    // Get both pointers
    const pointerArray = Array.from(this.pointers.values());
    if (pointerArray.length < 2) return;

    const [p1, p2] = pointerArray;
    const dx = p2.lastX - p1.lastX;
    const dy = p2.lastY - p1.lastY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    const centerX = (p1.lastX + p2.lastX) / 2;
    const centerY = (p1.lastY + p2.lastY) / 2;

    // Two-finger panning: track centroid movement
    if (this.lastTwoFingerCentroid !== null) {
      const panDx = centerX - this.lastTwoFingerCentroid.x;
      const panDy = centerY - this.lastTwoFingerCentroid.y;

      // Apply pan
      mapProvider.panBy(-panDx, -panDy);
    }

    // Pinch zoom
    if (this.lastPinchDistance !== null && distance > 0) {
      // Normalize zoom delta by viewport diagonal to make sensitivity consistent across devices
      const rect = target.getBoundingClientRect();
      const viewportDiagonal = Math.sqrt(rect.width * rect.width + rect.height * rect.height);

      // Scale the zoom delta by how much of the viewport diagonal the gesture represents
      const normalizedScale = (distance / viewportDiagonal) / (this.lastPinchDistance / viewportDiagonal);
      const zoomDelta = (normalizedScale - 1) * 2;

      // Convert from client coordinates to element-relative coordinates
      mapProvider.zoomAtPoint(centerX - rect.left, centerY - rect.top, zoomDelta);
    }

    // Rotation
    if (this.lastPinchAngle !== null) {
      const angleDelta = angle - this.lastPinchAngle;
      const currentRotation = mapProvider.getRotation();
      mapProvider.setRotation(currentRotation + angleDelta, false);
    }

    this.lastTwoFingerCentroid = { x: centerX, y: centerY };
    this.lastPinchDistance = distance;
    this.lastPinchAngle = angle;
  }

  private stopInertia(): void {
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
