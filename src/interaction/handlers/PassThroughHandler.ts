import { MapProvider } from '../../map/types';
import { InteractionHandler } from '../types';

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

  // Inertia state
  private velocitySamples: VelocitySample[] = [];
  private readonly maxVelocitySamples = 5;
  private inertiaAnimationId: number | null = null;
  private readonly friction = 0.95; // Deceleration factor per frame
  private readonly minVelocity = 0.5; // Stop when velocity drops below this

  onPointerDown(e: PointerEvent, _mapProvider: MapProvider): void {
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
  }

  onPointerMove(e: PointerEvent, mapProvider: MapProvider): void {
    const pointer = this.pointers.get(e.pointerId);
    if (!pointer) return;

    const now = performance.now();

    if (this.pointers.size === 1) {
      // Single pointer: pan
      const dx = pointer.lastX - e.clientX;
      const dy = pointer.lastY - e.clientY;
      mapProvider.panBy(dx, dy);

      // Track velocity for inertia
      const dt = now - pointer.lastTime;
      if (dt > 0) {
        const vx = (e.clientX - pointer.lastX) / dt;
        const vy = (e.clientY - pointer.lastY) / dt;
        this.velocitySamples.push({ vx, vy, time: now });
        // Keep only recent samples
        if (this.velocitySamples.length > this.maxVelocitySamples) {
          this.velocitySamples.shift();
        }
      }
    } else if (this.pointers.size === 2) {
      // Two pointers: pinch zoom + rotate
      this.handlePinchAndRotate(e, mapProvider);
    }

    pointer.lastX = e.clientX;
    pointer.lastY = e.clientY;
    pointer.lastTime = now;
  }

  onPointerUp(e: PointerEvent, mapProvider: MapProvider): void {
    const wasSinglePointer = this.pointers.size === 1;
    this.pointers.delete(e.pointerId);

    if (this.pointers.size < 2) {
      this.lastPinchDistance = null;
      this.lastPinchAngle = null;
    }

    // Start inertia only if we were single-finger panning and now have no pointers
    if (wasSinglePointer && this.pointers.size === 0) {
      this.startInertia(mapProvider);
    }
  }

  onWheel(e: WheelEvent, mapProvider: MapProvider): void {
    // Normalize wheel delta to a zoom increment
    const zoomDelta = -e.deltaY * 0.002;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mapProvider.zoomAtPoint(x, y, zoomDelta);
  }

  private handlePinchAndRotate(e: PointerEvent, mapProvider: MapProvider): void {
    // Update the current pointer
    const pointer = this.pointers.get(e.pointerId);
    if (pointer) {
      pointer.lastX = e.clientX;
      pointer.lastY = e.clientY;
    }

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

    if (this.lastPinchDistance !== null) {
      // Zoom based on distance change
      const scale = distance / this.lastPinchDistance;
      const zoomDelta = (scale - 1) * 2;
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      mapProvider.zoomAtPoint(centerX - rect.left, centerY - rect.top, zoomDelta);
    }

    if (this.lastPinchAngle !== null) {
      // Rotation
      const angleDelta = angle - this.lastPinchAngle;
      const currentRotation = mapProvider.getRotation();
      mapProvider.setRotation(currentRotation + angleDelta, false);
    }

    this.lastPinchDistance = distance;
    this.lastPinchAngle = angle;
  }

  private stopInertia(): void {
    if (this.inertiaAnimationId !== null) {
      cancelAnimationFrame(this.inertiaAnimationId);
      this.inertiaAnimationId = null;
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

      // Apply friction
      vx *= this.friction;
      vy *= this.friction;

      // Check if we should continue
      const currentSpeed = Math.sqrt(vx * vx + vy * vy);
      if (currentSpeed > this.minVelocity) {
        this.inertiaAnimationId = requestAnimationFrame(animate);
      } else {
        this.inertiaAnimationId = null;
      }
    };

    this.inertiaAnimationId = requestAnimationFrame(animate);
  }
}
