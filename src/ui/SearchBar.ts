import { MapProvider } from '../map/types';

declare const mapkit: any;

export class SearchBar {
  private container: HTMLElement;
  private mapProvider: MapProvider;
  private search: any = null;
  private currentPlaces: any[] = [];

  constructor(container: HTMLElement, mapProvider: MapProvider) {
    this.container = container;
    this.mapProvider = mapProvider;
    this.render();
    this.initSearch();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="search-bar">
        <input
          id="search-input"
          type="text"
          placeholder="Search places..."
          autocomplete="off"
        />
        <div id="search-results" class="search-results hidden"></div>
      </div>
    `;

    const input = this.container.querySelector('#search-input') as HTMLInputElement;
    let debounceTimer: number;

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        this.performSearch(input.value);
      }, 300);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        input.blur();
        this.hideResults();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.selectFirstResult(input);
      }
    });
  }

  private initSearch(): void {
    if (typeof mapkit !== 'undefined') {
      this.search = new mapkit.Search();
    }
  }

  private performSearch(query: string): void {
    if (!query.trim()) {
      this.hideResults();
      return;
    }

    if (!this.search) {
      this.initSearch();
      if (!this.search) return;
    }

    // Get current map center to bias search results to the visible area
    const center = this.mapProvider.getCenter();
    const coordinate = new mapkit.Coordinate(center.lat, center.lng);

    this.search.search(query, (error: any, data: any) => {
      if (error) {
        console.warn('Search error:', error);
        return;
      }
      this.showResults(data.places || []);
    }, { coordinate });
  }

  private selectFirstResult(input: HTMLInputElement): void {
    // If we already have results, select the first one
    if (this.currentPlaces.length > 0) {
      this.navigateToPlace(this.currentPlaces[0], input);
      return;
    }

    // Otherwise perform an immediate search
    const query = input.value.trim();
    if (!query || !this.search) return;

    const center = this.mapProvider.getCenter();
    const coordinate = new mapkit.Coordinate(center.lat, center.lng);

    this.search.search(query, (error: any, data: any) => {
      if (error || !data.places || data.places.length === 0) {
        console.warn('Search error or no results:', error);
        return;
      }
      this.navigateToPlace(data.places[0], input);
    }, { coordinate });
  }

  private navigateToPlace(place: any, input: HTMLInputElement): void {
    const coord = place.coordinate;
    this.mapProvider.setCenter(coord.latitude, coord.longitude);
    this.mapProvider.setZoom(15);
    this.hideResults();
    input.value = place.name || place.formattedAddress || '';
    input.blur();
  }

  private showResults(places: any[]): void {
    this.currentPlaces = places;
    const resultsEl = this.container.querySelector('#search-results') as HTMLElement;
    if (places.length === 0) {
      this.hideResults();
      return;
    }

    resultsEl.innerHTML = places
      .slice(0, 5)
      .map(
        (place: any, i: number) => `
        <div class="search-result-item" data-index="${i}">
          <span class="result-name">${place.name || ''}</span>
          <span class="result-address">${place.formattedAddress || ''}</span>
        </div>
      `
      )
      .join('');

    resultsEl.classList.remove('hidden');

    resultsEl.querySelectorAll('.search-result-item').forEach((item, i) => {
      item.addEventListener('click', () => {
        const place = places[i];
        const coord = place.coordinate;
        this.mapProvider.setCenter(coord.latitude, coord.longitude);
        this.mapProvider.setZoom(15);
        this.hideResults();
        (this.container.querySelector('#search-input') as HTMLInputElement).value =
          place.name || place.formattedAddress || '';
      });
    });
  }

  private hideResults(): void {
    const resultsEl = this.container.querySelector('#search-results') as HTMLElement;
    if (resultsEl) {
      resultsEl.classList.add('hidden');
    }
  }

  destroy(): void {
    this.container.innerHTML = '';
  }
}
