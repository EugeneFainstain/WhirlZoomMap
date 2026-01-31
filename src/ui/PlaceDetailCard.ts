import { PlaceData, RouteInfo, LatLng, MapProvider } from '../map/types';

// Category icons mapping
const CATEGORY_ICONS: Record<string, string> = {
  Restaurant: '🍽️',
  Cafe: '☕',
  Bakery: '🥐',
  Store: '🛒',
  GasStation: '⛽',
  Parking: '🅿️',
  Hotel: '🏨',
  Hospital: '🏥',
  Pharmacy: '💊',
  Bank: '🏦',
  ATM: '🏧',
  Park: '🌳',
  Beach: '🏖️',
  Museum: '🏛️',
  Theater: '🎭',
  MovieTheater: '🎬',
  Gym: '💪',
  School: '🏫',
  Library: '📚',
  PostOffice: '📮',
  Airport: '✈️',
  TrainStation: '🚂',
  BusStation: '🚌',
};

export class PlaceDetailCard {
  private container: HTMLElement;
  private place: PlaceData;
  private mapProvider: MapProvider;
  private onClose: () => void;
  private routeInfo: RouteInfo | null = null;
  private isLoadingDirections = false;

  constructor(
    container: HTMLElement,
    place: PlaceData,
    mapProvider: MapProvider,
    onClose: () => void
  ) {
    this.container = container;
    this.place = place;
    this.mapProvider = mapProvider;
    this.onClose = onClose;
    this.render();
  }

  private getCategoryIcon(): string {
    const category = this.place.pointOfInterestCategory || '';
    return CATEGORY_ICONS[category] || '📍';
  }

  private formatHours(): string | null {
    if (!this.place.hours) return null;

    const { isOpen, closesAt, opensAt } = this.place.hours;
    if (isOpen && closesAt) {
      return `Open until ${closesAt}`;
    } else if (!isOpen && opensAt) {
      return `Closed · Opens ${opensAt}`;
    } else if (isOpen) {
      return 'Open now';
    } else {
      return 'Closed';
    }
  }

  private formatDistance(meters: number): string {
    const miles = meters / 1609.34;
    if (miles < 0.1) {
      const feet = Math.round(meters * 3.28084);
      return `${feet} ft`;
    }
    return `${miles.toFixed(1)} mi`;
  }

  private formatDuration(seconds: number): string {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    return remainingMins > 0 ? `${hours} hr ${remainingMins} min` : `${hours} hr`;
  }

  private render(): void {
    const icon = this.getCategoryIcon();
    const hours = this.formatHours();

    let routeHtml = '';
    if (this.isLoadingDirections) {
      routeHtml = `
        <div class="place-detail-route loading">
          <span class="route-icon">🚗</span>
          <span>Getting directions...</span>
        </div>
      `;
    } else if (this.routeInfo) {
      routeHtml = `
        <div class="place-detail-route">
          <span class="route-icon">🚗</span>
          <span>${this.formatDuration(this.routeInfo.duration)} · ${this.formatDistance(this.routeInfo.distance)}</span>
        </div>
      `;
    }

    this.container.innerHTML = `
      <div class="place-detail-card">
        <div class="place-detail-header">
          <span class="place-icon">${icon}</span>
          <div class="place-name-container">
            <div class="place-name">${this.escapeHtml(this.place.name)}</div>
          </div>
          <button class="place-close-btn" title="Close">✕</button>
        </div>

        ${routeHtml}

        <div class="place-detail-info">
          ${hours ? `
            <div class="info-row">
              <span class="info-icon">⏰</span>
              <span class="info-text ${this.place.hours?.isOpen ? 'open' : 'closed'}">${hours}</span>
            </div>
          ` : ''}

          ${this.place.formattedAddress ? `
            <div class="info-row">
              <span class="info-icon">📍</span>
              <span class="info-text">${this.escapeHtml(this.place.formattedAddress)}</span>
            </div>
          ` : ''}

          ${this.place.telephone ? `
            <div class="info-row clickable" data-action="phone">
              <span class="info-icon">📞</span>
              <a href="tel:${this.escapeHtml(this.place.telephone)}" class="info-text info-link">${this.escapeHtml(this.place.telephone)}</a>
            </div>
          ` : ''}

          ${this.place.website ? `
            <div class="info-row clickable" data-action="website">
              <span class="info-icon">🌐</span>
              <a href="${this.escapeHtml(this.place.website)}" target="_blank" rel="noopener" class="info-text info-link">${this.formatWebsite(this.place.website)}</a>
            </div>
          ` : ''}
        </div>

        <div class="place-detail-actions">
          <button class="place-action-btn directions-btn" ${this.isLoadingDirections ? 'disabled' : ''}>
            ${this.routeInfo ? 'Clear Route' : '🚗 Directions'}
          </button>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    // Close button
    this.container.querySelector('.place-close-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onClose();
    });

    // Directions button
    this.container.querySelector('.directions-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.routeInfo) {
        this.clearRoute();
      } else {
        this.requestDirections();
      }
    });
  }

  private async requestDirections(): Promise<void> {
    if (this.isLoadingDirections) return;

    this.isLoadingDirections = true;
    this.render();

    try {
      // Get user's current location
      const userLocation = await this.getUserLocation();

      // Get directions from MapProvider
      const destination: LatLng = {
        lat: this.place.coordinate.latitude,
        lng: this.place.coordinate.longitude,
      };

      this.routeInfo = await this.mapProvider.getDirections(userLocation, destination);

      // Show route on map
      this.mapProvider.showRoute(this.routeInfo.polylinePoints);
    } catch (error) {
      console.warn('Failed to get directions:', error);
      // Could show an error message to user here
    } finally {
      this.isLoadingDirections = false;
      this.render();
    }
  }

  private getUserLocation(): Promise<LatLng> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          reject(error);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  private clearRoute(): void {
    this.routeInfo = null;
    this.mapProvider.clearRoute();
    this.render();
  }

  private formatWebsite(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy(): void {
    if (this.routeInfo) {
      this.mapProvider.clearRoute();
    }
    this.container.innerHTML = '';
  }
}
