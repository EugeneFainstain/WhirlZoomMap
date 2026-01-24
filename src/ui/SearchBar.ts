import { MapProvider } from '../map/types';

declare const mapkit: any;

export class SearchBar {
  private container: HTMLElement;
  private mapProvider: MapProvider;
  private search: any = null;

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

    this.search.search(query, (error: any, data: any) => {
      if (error) {
        console.warn('Search error:', error);
        return;
      }
      this.showResults(data.places || []);
    });
  }

  private showResults(places: any[]): void {
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
