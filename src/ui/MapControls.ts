import { MapProvider } from '../map/types';
import { LOCATION_BUTTON_ZOOM } from '../control';

interface StopInertiaFn {
  stopInertia(): void;
}

export class MapControls {
  private container: HTMLElement;
  private mapProvider: MapProvider;
  private handler: StopInertiaFn | null;

  constructor(container: HTMLElement, mapProvider: MapProvider, handler?: StopInertiaFn) {
    this.container = container;
    this.mapProvider = mapProvider;
    this.handler = handler ?? null;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <button id="my-location" class="map-control-btn map-control-btn-large" title="My location">
        <svg width="32" height="32" viewBox="0 0 90 90" fill="none">
          <circle cx="45" cy="45" r="15" fill="rgb(0,183,255)"/>
          <path d="M 90 41 H 79.01 C 77.175 25.306 64.694 12.825 49 10.99 V 0 h -8 v 10.99 C 25.306 12.825 12.825 25.306 10.99 41 H 0 v 8 h 10.99 C 12.825 64.694 25.306 77.175 41 79.01 V 90 h 8 V 79.01 C 64.694 77.175 77.175 64.694 79.01 49 H 90 V 41 z M 45 71.251 c -14.475 0 -26.251 -11.776 -26.251 -26.251 S 30.525 18.749 45 18.749 S 71.251 30.525 71.251 45 S 59.475 71.251 45 71.251 z" fill="rgb(0,183,255)"/>
        </svg>
      </button>
    `;

    this.container.querySelector('#my-location')!.addEventListener('pointerdown', (e) => {
      e.preventDefault(); // Prevent any default touch behavior
      this.goToMyLocation();
    });
  }

  private goToMyLocation(): void {
    // Stop any ongoing inertia animation
    this.handler?.stopInertia();
    // Reset rotation to north
    this.mapProvider.setRotation(0, false);
    // Center on user location
    this.mapProvider.centerOnUserLocation(LOCATION_BUTTON_ZOOM).catch(() => {
      console.warn('Geolocation permission denied or unavailable.');
    });
  }

  destroy(): void {
    this.container.innerHTML = '';
  }
}
