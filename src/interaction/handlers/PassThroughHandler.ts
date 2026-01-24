import { MapProvider } from '../../map/types';
import { InteractionHandler } from '../types';

interface PointerState {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
}

export class PassThroughHandler implements InteractionHandler {
  private pointers: Map<number, PointerState> = new Map();
  private lastPinchDistance: number | null = null;
  private lastPinchAngle: number | null = null;

  onPointerDown(e: PointerEvent, _mapProvider: MapProvider): void {
    this.pointers.set(e.pointerId, {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
    });
  }

  onPointerMove(e: PointerEvent, mapProvider: MapProvider): void {
    const pointer = this.pointers.get(e.pointerId);
    if (!pointer) return;

    if (this.pointers.size === 1) {
      // Single pointer: pan
      const dx = pointer.lastX - e.clientX;
      const dy = pointer.lastY - e.clientY;
      mapProvider.panBy(dx, dy);
    } else if (this.pointers.size === 2) {
      // Two pointers: pinch zoom + rotate
      this.handlePinchAndRotate(e, mapProvider);
    }

    pointer.lastX = e.clientX;
    pointer.lastY = e.clientY;
  }

  onPointerUp(e: PointerEvent, _mapProvider: MapProvider): void {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) {
      this.lastPinchDistance = null;
      this.lastPinchAngle = null;
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
}
