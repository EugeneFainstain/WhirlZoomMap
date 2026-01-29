import { MapProvider } from '../map/types';
import { InteractionHandler } from './types';

export class InteractionLayer {
  private element: HTMLElement;
  private handler: InteractionHandler;
  private mapProvider: MapProvider;
  private activePointers: Set<number> = new Set();
  private enabled: boolean = true;

  constructor(element: HTMLElement, handler: InteractionHandler, mapProvider: MapProvider) {
    this.element = element;
    this.handler = handler;
    this.mapProvider = mapProvider;

    this.bindEvents();
  }

  private bindEvents(): void {
    // Listen on document to intercept events before they reach the map
    document.addEventListener('pointerdown', this.onPointerDown, true);
    document.addEventListener('pointermove', this.onPointerMove, true);
    document.addEventListener('pointerup', this.onPointerUp, true);
    document.addEventListener('pointercancel', this.onPointerUp, true);

    // Wheel events - listen on document for the map area
    document.addEventListener('wheel', this.onWheelCapture, { passive: false, capture: true });
  }

  private onWheelCapture = (e: WheelEvent): void => {
    if (this.enabled && this.isEventOnMap(e)) {
      e.preventDefault();
      this.handler.onWheel(e, this.mapProvider);
    }
  };

  private isEventOnMap(e: { clientX: number; clientY: number }): boolean {
    const rect = this.element.getBoundingClientRect();
    return (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    );
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.enabled || !this.isEventOnMap(e)) return;

    this.activePointers.add(e.pointerId);
    this.handler.onPointerDown(e, this.mapProvider, this.element);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.activePointers.has(e.pointerId)) return;

    this.handler.onPointerMove(e, this.mapProvider, this.element);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.activePointers.has(e.pointerId)) return;

    this.activePointers.delete(e.pointerId);
    this.handler.onPointerUp(e, this.mapProvider);
  };

  setHandler(handler: InteractionHandler): void {
    this.handler = handler;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    // Clear active pointers when disabling to prevent stuck gestures
    if (!enabled) {
      this.activePointers.clear();
    }
  }

  destroy(): void {
    document.removeEventListener('pointerdown', this.onPointerDown, true);
    document.removeEventListener('pointermove', this.onPointerMove, true);
    document.removeEventListener('pointerup', this.onPointerUp, true);
    document.removeEventListener('pointercancel', this.onPointerUp, true);
    document.removeEventListener('wheel', this.onWheelCapture, true);
  }
}
