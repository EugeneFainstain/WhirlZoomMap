import { MapProvider } from '../map/types';
import { InteractionHandler } from './types';

export class InteractionLayer {
  private element: HTMLElement;
  private handler: InteractionHandler;
  private mapProvider: MapProvider;

  constructor(element: HTMLElement, handler: InteractionHandler, mapProvider: MapProvider) {
    this.element = element;
    this.handler = handler;
    this.mapProvider = mapProvider;

    this.bindEvents();
  }

  private bindEvents(): void {
    this.element.addEventListener('pointerdown', this.onPointerDown);
    this.element.addEventListener('pointermove', this.onPointerMove);
    this.element.addEventListener('pointerup', this.onPointerUp);
    this.element.addEventListener('pointercancel', this.onPointerUp);
    this.element.addEventListener('wheel', this.onWheel, { passive: false });

    // Prevent default touch behaviors (browser zoom, scroll)
    this.element.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    this.element.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.element.setPointerCapture(e.pointerId);
    this.handler.onPointerDown(e, this.mapProvider);
  };

  private onPointerMove = (e: PointerEvent): void => {
    this.handler.onPointerMove(e, this.mapProvider);
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.element.releasePointerCapture(e.pointerId);
    this.handler.onPointerUp(e, this.mapProvider);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.handler.onWheel(e, this.mapProvider);
  };

  setHandler(handler: InteractionHandler): void {
    this.handler = handler;
  }

  destroy(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointercancel', this.onPointerUp);
    this.element.removeEventListener('wheel', this.onWheel);
  }
}
