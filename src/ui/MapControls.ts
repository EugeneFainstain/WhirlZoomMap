import { MapProvider } from '../map/types';

export class MapControls {
  private container: HTMLElement;
  private mapProvider: MapProvider;

  constructor(container: HTMLElement, mapProvider: MapProvider) {
    this.container = container;
    this.mapProvider = mapProvider;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <button id="zoom-in" class="map-control-btn" title="Zoom in">+</button>
      <button id="zoom-out" class="map-control-btn" title="Zoom out">−</button>
      <button id="compass" class="map-control-btn compass-btn" title="Reset rotation">
        <span class="compass-needle">▲</span>
      </button>
      <button id="my-location" class="map-control-btn" title="My location">◎</button>
    `;

    this.container.querySelector('#zoom-in')!.addEventListener('click', () => {
      const zoom = this.mapProvider.getZoom();
      this.mapProvider.setZoom(Math.min(20, zoom + 1));
    });

    this.container.querySelector('#zoom-out')!.addEventListener('click', () => {
      const zoom = this.mapProvider.getZoom();
      this.mapProvider.setZoom(Math.max(1, zoom - 1));
    });

    this.container.querySelector('#compass')!.addEventListener('click', () => {
      this.mapProvider.setRotation(0);
    });

    this.container.querySelector('#my-location')!.addEventListener('click', () => {
      this.goToMyLocation();
    });
  }

  private goToMyLocation(): void {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.mapProvider.setCenter(pos.coords.latitude, pos.coords.longitude);
        this.mapProvider.setZoom(15);
      },
      () => {
        console.warn('Geolocation permission denied or unavailable.');
      }
    );
  }

  updateCompass(rotation: number): void {
    const needle = this.container.querySelector('.compass-needle') as HTMLElement;
    if (needle) {
      needle.style.transform = `rotate(${-rotation}deg)`;
    }
  }

  destroy(): void {
    this.container.innerHTML = '';
  }
}
