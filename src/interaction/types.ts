import { MapProvider } from '../map/types';

export interface InteractionHandler {
  onPointerDown(e: PointerEvent, mapProvider: MapProvider, viewport: HTMLElement): void;
  onPointerMove(e: PointerEvent, mapProvider: MapProvider, viewport: HTMLElement): void;
  onPointerUp(e: PointerEvent, mapProvider: MapProvider): void;
  onWheel(e: WheelEvent, mapProvider: MapProvider): void;
}
