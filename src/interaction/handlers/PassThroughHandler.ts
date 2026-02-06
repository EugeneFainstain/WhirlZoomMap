import { MapProvider } from '../../map/types';
import { InteractionHandler } from '../types';
import { TrailVisualizer } from '../../visualization/TrailVisualizer';
import { EdgeIndicator } from '../../visualization/EdgeIndicator';
import { GearIndicator } from '../../visualization/GearIndicator';
import {
  ROTATION_MODE,
  ROTATION_ENABLED,
  ROTATION_SPEED_DEG_PER_SEC,
  ROTATION_MAX_DT,
  GEAR_SIZE_PX,
  GEAR_MARGIN_RATIO,
  GEAR_SYNC_WITH_MAP,
  INERTIA_MAX_VELOCITY_SAMPLES,
  INERTIA_FRICTION,
  INERTIA_MIN_VELOCITY,
  INERTIA_SAMPLE_WINDOW_MS,
  ZOOM_WHEEL_SENSITIVITY,
  ZOOM_BLOCK_DURATION_MS,
  ZOOM_AREA_THRESHOLD,
  ZOOM_ALT1_THRESHOLD,
  ZOOM_RATE_COEFF,
  PAN_THRESHOLD,
} from '../../control';

// Epsilons - not tunable, just small numbers
const ROTATION_DELTA_THRESHOLD = 0.01;
const ZOOM_MIN_DELTA = 0.0001;

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
  private gearIndicator: GearIndicator | null = null;

  // The geographic coordinate that should stay under the finger during drag
  private mapAnchorPos: { lat: number; lng: number } | null = null;

  // Inertia state
  private velocitySamples: VelocitySample[] = [];
  private inertiaAnimationId: number | null = null;

  // Track the centroid of two-finger gestures for panning
  private lastTwoFingerCentroid: { x: number; y: number } | null = null;


  // Track if zoom threshold has been crossed during current drag
  private zoomActivated: boolean = false;
  private alt1ZoomActivated: boolean = false;

  // Track drag start time for zoom blocking
  private dragStartTime: number = 0;

  // Alt1 mode: use compound zoom value instead of signed area
  private alt1Mode: boolean = false;

  // Viewport element for consistent bounds calculations
  private viewport: HTMLElement | null = null;

  // State for edge-based rotation (continuous rotation even when finger is stationary)
  private currentMapProvider: MapProvider | null = null;
  private draggingFingerX: number = 0;
  private draggingFingerY: number = 0;
  private lastRotationTime: number = 0;
  private isRotating: boolean = false;

  // State for gear-mode rotation (rotation via vertical drag when gear is near edge)
  private gearRotationActive: boolean = false;
  private lastGearRotationY: number = 0;
  private gearNearLeftEdge: boolean = false;
  private gearNearRightEdge: boolean = false;

  // State for decoupled visualization rendering (reduces lag on mobile)
  private visualizationLoopId: number | null = null;
  private latestFingerX: number = 0;
  private latestFingerY: number = 0;
  private isDraggingSingleFinger: boolean = false;

  // Previous frame's visual position and rotation (for GEAR_SYNC_WITH_MAP mode)
  private prevVisualX: number = 0;
  private prevVisualY: number = 0;
  private prevRotation: number | null = null;

  setVisualizer(visualizer: TrailVisualizer | null): void {
    this.visualizer = visualizer;
  }

  setEdgeIndicator(edgeIndicator: EdgeIndicator | null): void {
    this.edgeIndicator = edgeIndicator;
    if (edgeIndicator) {
      edgeIndicator.setRotationCallback(
        (rate: number) => {
          this.applyEdgeRotation(rate);
        },
        () => {
          // Entering edge zone - treat as if drag hasn't started yet
          this.isRotating = true;
          this.zoomActivated = false;
          this.alt1ZoomActivated = false;
          if (this.visualizer) {
            this.visualizer.setZoomActivated(false);
            this.visualizer.setAlt1ZoomActivated(false);
            this.visualizer.setZoomBlocked(this.isRotating, this.dragStartTime);
          }
        },
        () => {
          // Leaving edge zone - equivalent to starting a new drag gesture
          this.isRotating = false;
          this.lastRotationTime = 0;
          this.dragStartTime = performance.now(); // Start the 0.5 sec timeout
        }
      );
    }
  }

  setGearIndicator(gearIndicator: GearIndicator | null): void {
    this.gearIndicator = gearIndicator;
  }

  /**
   * Start the visualization loop for rendering gear/trail with minimal lag.
   * This loop runs via requestAnimationFrame and uses the freshest finger position.
   */
  private startVisualizationLoop(): void {
    if (this.visualizationLoopId !== null) return;

    const loop = () => {
      if (!this.isDraggingSingleFinger) {
        this.visualizationLoopId = null;
        return;
      }

      // Use the latest finger position directly
      const fingerX = this.latestFingerX;
      const fingerY = this.latestFingerY;

      // Handle gear rotation
      if (this.gearRotationActive && this.mapAnchorPos && this.currentMapProvider && this.viewport) {
        // On first frame of rotation, just initialize lastGearRotationY
        if (this.lastGearRotationY === 0) {
          this.lastGearRotationY = fingerY;
        } else {
          const deltaY = fingerY - this.lastGearRotationY;
          // Rolling without slippage: angle = distance / radius (in radians)
          // Convert to degrees: angle_deg = (deltaY / rollingRadius) * (180 / π)
          const gearRadius = GEAR_SIZE_PX / 2;
          const rollingRadius = GEAR_MARGIN_RATIO * gearRadius;
          const rotationRate = (deltaY / rollingRadius) * (180 / Math.PI);

          let rotationDelta = rotationRate;
          if (this.gearNearLeftEdge) {
            rotationDelta = rotationRate; // Left edge: down = CW
          } else if (this.gearNearRightEdge) {
            rotationDelta = -rotationRate; // Right edge: down = CCW
          }

          if (ROTATION_ENABLED && Math.abs(rotationDelta) > ROTATION_DELTA_THRESHOLD) {
            const rotation = this.currentMapProvider.getRotation();
            this.currentMapProvider.setRotation(rotation + rotationDelta, false);
          }

          this.lastGearRotationY = fingerY;
        }
      }

      // Clamp X coordinate so the drag point stays within the gear margin from edges
      const rect = this.viewport?.getBoundingClientRect();
      let clampedX = fingerX;
      if (rect) {
        const gearRadius = GEAR_SIZE_PX / 2;
        const rollingRadius = GEAR_MARGIN_RATIO * gearRadius;
        const minX = rect.left + rollingRadius;
        const maxX = rect.right - rollingRadius;
        clampedX = Math.max(minX, Math.min(maxX, fingerX));
      }

      // Use clamped position for all visuals (gear, drag indicator)
      let visualX = clampedX;
      let visualY = fingerY;

      // If syncing with map, use the PREVIOUS frame's target position
      // (map rendering is one frame behind, so gear should match that)
      if (GEAR_SYNC_WITH_MAP && this.prevVisualX !== 0) {
        visualX = this.prevVisualX;
        visualY = this.prevVisualY;
      }

      // Store current target for next frame
      this.prevVisualX = clampedX;
      this.prevVisualY = fingerY;

      // Position the map anchor at the clamped position (visual update happens next frame)
      if (this.mapAnchorPos && this.currentMapProvider) {
        this.positionCoordinateAtScreenPoint(this.currentMapProvider, this.mapAnchorPos, clampedX, fingerY);
      }

      // Gear uses viewport-relative coords (for CSS positioning)
      // Visualizer uses client coords (for canvas drawing)
      if (rect) {
        const viewportX = visualX - rect.left;
        const viewportY = visualY - rect.top;

        // Update gear indicator with viewport-relative coords
        if (ROTATION_MODE === 'gear' && this.gearIndicator && this.currentMapProvider) {
          const currentRotation = this.currentMapProvider.getRotation();
          // Use previous frame's rotation when syncing with map (same as position)
          const gearRotation = (GEAR_SYNC_WITH_MAP && this.prevRotation !== null)
            ? this.prevRotation
            : currentRotation;
          this.prevRotation = currentRotation;
          this.gearIndicator.update(this.latestFingerX, this.latestFingerY, viewportX, viewportY, true, gearRotation);
        }
      }

      // Update visualizer drag point with CLIENT coords (canvas expects these)
      // Then call render() to ensure the draw happens immediately after the update.
      // This prevents the drag indicator from being one frame behind due to
      // TrailVisualizer's own animation loop running before this update.
      if (this.visualizer) {
        this.visualizer.updateDragPoint(visualX, visualY);
        this.visualizer.render();
      }

      this.visualizationLoopId = requestAnimationFrame(loop);
    };

    this.visualizationLoopId = requestAnimationFrame(loop);
  }

  private stopVisualizationLoop(): void {
    if (this.visualizationLoopId !== null) {
      cancelAnimationFrame(this.visualizationLoopId);
      this.visualizationLoopId = null;
    }
  }

  private applyEdgeRotation(rate: number): void {
    // Only apply edge rotation in edge mode
    if (!ROTATION_ENABLED) return;
    if (ROTATION_MODE !== 'edge') return;
    if (!this.currentMapProvider || !this.mapAnchorPos) return;

    const now = performance.now();
    const dt = this.lastRotationTime > 0 ? (now - this.lastRotationTime) / 1000 : 1 / 60;
    this.lastRotationTime = now;

    // Clamp dt to prevent huge jumps
    const clampedDt = Math.min(dt, ROTATION_MAX_DT);

    // Rotation speed: degrees per second at full progress
    const rotationSpeed = ROTATION_SPEED_DEG_PER_SEC;
    const rotationDelta = rate * rotationSpeed * clampedDt;
    const currentRotation = this.currentMapProvider.getRotation();
    this.currentMapProvider.setRotation(currentRotation + rotationDelta, false);

    // Reposition the anchor to keep the finger point stable
    this.positionCoordinateAtScreenPoint(
      this.currentMapProvider,
      this.mapAnchorPos,
      this.draggingFingerX,
      this.draggingFingerY
    );

    // Update gear indicator every frame during rotation
    if (this.gearIndicator && this.viewport) {
      const anchorScreen = this.getScreenPointForCoordinate(this.currentMapProvider, this.mapAnchorPos, this.viewport);
      if (anchorScreen) {
        const rotation = this.currentMapProvider.getRotation();
        this.gearIndicator.update(this.draggingFingerX, this.draggingFingerY, anchorScreen.x, anchorScreen.y, true, rotation);
      }
    }
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

  private getScreenPointForCoordinate(
    mapProvider: MapProvider,
    coord: { lat: number; lng: number },
    viewport: HTMLElement
  ): { x: number; y: number } | null {
    const provider = mapProvider as any;
    if (!provider.map || !provider.container) return null;

    const mapkit = (window as any).mapkit;
    const mapkitCoord = new mapkit.Coordinate(coord.lat, coord.lng);
    const pagePoint = provider.map.convertCoordinateToPointOnPage(mapkitCoord);

    // Convert page coordinates to coordinates relative to the viewport
    const rect = viewport.getBoundingClientRect();
    return {
      x: pagePoint.x - rect.left,
      y: pagePoint.y - rect.top,
    };
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
      this.dragStartTime = performance.now(); // Start zoom block timer
      if (this.visualizer) {
        this.visualizer.setZoomActivated(false);
        this.visualizer.setAlt1ZoomActivated(false);
        this.visualizer.setZoomBlocked(this.isRotating, this.dragStartTime);
      }
      const coord = this.getCoordinateAtScreenPoint(mapProvider, e.clientX, e.clientY);
      if (coord) {
        this.mapAnchorPos = coord;
      }
      // Store state for edge-based rotation
      this.currentMapProvider = mapProvider;
      this.draggingFingerX = e.clientX;
      this.draggingFingerY = e.clientY;
      this.lastRotationTime = 0; // Reset so first rotation frame uses default dt

      // Start decoupled visualization loop for low-latency rendering
      this.latestFingerX = e.clientX;
      this.latestFingerY = e.clientY;
      this.prevVisualX = 0; // Reset so first frame uses finger position
      this.prevVisualY = 0;
      this.prevRotation = null; // Reset so first frame uses current rotation
      this.isDraggingSingleFinger = true;
      this.startVisualizationLoop();
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

      // Check if zoom is still blocked (in edge zone OR within guard-rail timeout)
      const timeSinceDragStart = now - this.dragStartTime;
      const isZoomBlocked = this.isRotating || timeSinceDragStart < ZOOM_BLOCK_DURATION_MS;

      // Update visualizer's blocked state
      if (this.visualizer) {
        this.visualizer.setZoomBlocked(this.isRotating, this.dragStartTime);
      }

      // Get signed area and calculate zoom rate
      let zoomDelta = 0;
      if (this.visualizer && dt > 0 && !isZoomBlocked) {
        if (this.alt1Mode) {
          // Alt1 mode: use compound zoom value with thresholding
          const compoundValue = this.visualizer.getCompoundZoomValue();
          const threshold = ZOOM_ALT1_THRESHOLD;

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

            const zoomRate = normalizedValue * ZOOM_RATE_COEFF;
            zoomDelta = zoomRate * dt;
          }
        } else {
          // Normal mode: use signed area with threshold
          const signedArea = this.visualizer.getSignedArea();
          const threshold = ZOOM_AREA_THRESHOLD;

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
            const zoomRate = normalizedValue * ZOOM_RATE_COEFF;
            zoomDelta = zoomRate * dt;
          }
        }
      }

      // Update dragging finger position for edge-based rotation callback
      this.draggingFingerX = e.clientX;
      this.draggingFingerY = e.clientY;

      // Update latest finger position for decoupled visualization loop
      this.latestFingerX = e.clientX;
      this.latestFingerY = e.clientY;

      if (ROTATION_MODE === 'edge') {
        // Edge mode: use edge indicator with auto-rotation (no gear)
        if (this.edgeIndicator) {
          this.edgeIndicator.update(e.clientX, e.clientY, true);
        }
      } else {
        // Gear mode: handle rotation via vertical drag when finger is near edge
        const rect = viewport.getBoundingClientRect();
        const gearRadius = GEAR_SIZE_PX / 2;
        const edgeThreshold = GEAR_MARGIN_RATIO * gearRadius;

        // Use finger position for edge detection
        const fingerDistanceFromLeft = e.clientX - rect.left;
        const fingerDistanceFromRight = rect.right - e.clientX;
        const minFingerDistance = Math.min(fingerDistanceFromLeft, fingerDistanceFromRight);

        const wasGearRotationActive = this.gearRotationActive;
        // Activate rotation if finger is near edge (or past it)
        this.gearRotationActive = minFingerDistance <= edgeThreshold;

        // Handle entering gear rotation zone - reset zoom state and rotation tracking
        if (this.gearRotationActive && !wasGearRotationActive) {
          this.zoomActivated = false;
          this.alt1ZoomActivated = false;
          this.lastGearRotationY = 0; // Reset so visualization loop initializes it
          if (this.visualizer) {
            this.visualizer.setZoomActivated(false);
            this.visualizer.setAlt1ZoomActivated(false);
            this.visualizer.setZoomBlocked(true, this.dragStartTime);
          }
        }

        // Handle leaving gear rotation zone - start fresh zoom timeout
        if (!this.gearRotationActive && wasGearRotationActive) {
          this.dragStartTime = performance.now();
          this.lastGearRotationY = 0; // Clean up
        }

        if (this.gearRotationActive) {
          // Track which edge the finger is near (rotation is applied in visualization loop)
          this.gearNearLeftEdge = fingerDistanceFromLeft <= edgeThreshold;
          this.gearNearRightEdge = fingerDistanceFromRight <= edgeThreshold;

          // Block zoom while gear rotation is active
          this.isRotating = true;
        } else {
          this.isRotating = false;
        }
      }

      // Apply zoom if needed
      if (Math.abs(zoomDelta) > ZOOM_MIN_DELTA) {
        const rect = viewport.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        mapProvider.zoomAtPoint(x, y, zoomDelta);
      }

      // Map positioning is handled in the visualization loop for lower latency.
      // Gear indicator is also updated there.

      // Track velocity for inertia
      if (dt > 0) {
        const vx = (e.clientX - pointer.lastX) / (dt * 1000);
        const vy = (e.clientY - pointer.lastY) / (dt * 1000);
        this.velocitySamples.push({ vx, vy, time: now });
        // Keep only recent samples
        if (this.velocitySamples.length > INERTIA_MAX_VELOCITY_SAMPLES) {
          this.velocitySamples.shift();
        }
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

        if (Math.abs(panDx) > PAN_THRESHOLD || Math.abs(panDy) > PAN_THRESHOLD) {
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
          this.mapAnchorPos = coord;
        }
      }
    }

    // Clear drag anchor when all pointers are released
    if (this.pointers.size === 0) {
      this.mapAnchorPos = null;
    }

    // When releasing from single-pointer drag
    if (wasSinglePointer && this.pointers.size === 0 && this.visualizer && pointer) {
      // Clear the drag point and set virtual touch point at the release position
      this.visualizer.clearDragPoint();
      this.visualizer.setVirtualTouchPoint(pointer.lastX, pointer.lastY);
    }

    // Hide indicators and clear rotation state when drag ends
    if (wasSinglePointer && this.pointers.size === 0) {
      // Stop the visualization loop
      this.isDraggingSingleFinger = false;
      this.stopVisualizationLoop();

      if (ROTATION_MODE === 'edge') {
        if (this.edgeIndicator) {
          this.edgeIndicator.hide();
        }
      } else {
        if (this.gearIndicator) {
          this.gearIndicator.hide();
        }
        this.gearRotationActive = false;
      }
      this.currentMapProvider = null;
      this.lastRotationTime = 0;
      this.isRotating = false;
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
    const zoomDelta = -e.deltaY * ZOOM_WHEEL_SENSITIVITY;
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

    // Only use recent samples (within last window)
    const now = performance.now();
    const recentSamples = this.velocitySamples.filter(s => now - s.time < INERTIA_SAMPLE_WINDOW_MS);

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
    if (speed < INERTIA_MIN_VELOCITY) {
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
      vx *= INERTIA_FRICTION;
      vy *= INERTIA_FRICTION;

      // Check if we should continue
      const currentSpeed = Math.sqrt(vx * vx + vy * vy);
      if (currentSpeed > INERTIA_MIN_VELOCITY) {
        this.inertiaAnimationId = requestAnimationFrame(animate);
      } else {
        this.inertiaAnimationId = null;
        // Don't clear virtual touch point here - let it persist for 2 seconds
      }
    };

    this.inertiaAnimationId = requestAnimationFrame(animate);
  }
}
