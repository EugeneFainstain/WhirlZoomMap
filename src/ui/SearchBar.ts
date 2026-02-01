import { MapProvider } from '../map/types';

declare const mapkit: any;

// Map common search terms to [minZoom, MapKit POI categories]
const SEARCH_TO_POI_CATEGORIES: Record<string, [number, string[]]> = {
  // Food & Drink (minZoom: 16)
  food:              [16, ['Restaurant', 'Cafe', 'Bakery', 'FoodMarket']],
  restaurant:        [16, ['Restaurant']],
  restaurants:       [16, ['Restaurant']],
  cafe:              [16, ['Cafe']],
  cafes:             [16, ['Cafe']],
  coffee:            [16, ['Cafe']],
  bakery:            [16, ['Bakery']],
  bakeries:          [16, ['Bakery']],
  grocery:           [16, ['FoodMarket']],
  groceries:         [16, ['FoodMarket']],
  supermarket:       [16, ['FoodMarket']],
  'food market':     [16, ['FoodMarket']],
  winery:            [16, ['Winery']],
  wine:              [16, ['Winery']],
  brewery:           [16, ['Brewery']],
  beer:              [16, ['Brewery']],
  distillery:        [16, ['Distillery']],

  // Nightlife & Entertainment (minZoom: 16)
  bar:               [16, ['Nightlife']],
  bars:              [16, ['Nightlife']],
  nightlife:         [16, ['Nightlife']],
  club:              [16, ['Nightlife']],
  clubs:             [16, ['Nightlife']],
  pub:               [16, ['Nightlife']],
  pubs:              [16, ['Nightlife']],
  movie:             [16, ['MovieTheater']],
  movies:            [16, ['MovieTheater']],
  cinema:            [16, ['MovieTheater']],
  'movie theater':   [16, ['MovieTheater']],
  theater:           [16, ['Theater']],
  theatre:           [16, ['Theater']],
  music:             [16, ['MusicVenue']],
  'music venue':     [16, ['MusicVenue']],
  concert:           [16, ['MusicVenue']],
  amusement:         [16, ['Amusement']],
  'amusement park':  [16, ['Amusement']],
  'theme park':      [16, ['Amusement']],
  casino:            [16, ['Casino']],
  casinos:           [16, ['Casino']],

  // Outdoors & Nature (minZoom: 13)
  park:              [13, ['Park']],
  parks:             [13, ['Park']],
  'national park':   [13, ['NationalPark']],
  beach:             [13, ['Beach']],
  beaches:           [13, ['Beach']],
  campground:        [13, ['Campground']],
  camping:           [13, ['Campground']],
  marina:            [13, ['Marina']],
  boat:              [13, ['Marina']],
  zoo:               [13, ['Zoo']],
  zoos:              [13, ['Zoo']],
  aquarium:          [13, ['Aquarium']],

  // Sports & Fitness (minZoom: 15.5)
  sport:             [15.5, ['FitnessCenter', 'Stadium', 'Swimming', 'Soccer', 'Volleyball', 'Tennis', 'Skating']],
  sports:            [15.5, ['FitnessCenter', 'Stadium', 'Swimming', 'Soccer', 'Volleyball', 'Tennis', 'Skating']],
  gym:               [15.5, ['FitnessCenter']],
  fitness:           [15.5, ['FitnessCenter']],
  'fitness center':  [15.5, ['FitnessCenter']],
  golf:              [15.5, ['Golf']],
  'golf course':     [15.5, ['Golf']],
  stadium:           [15.5, ['Stadium']],
  stadiums:          [15.5, ['Stadium']],
  skating:           [15.5, ['Skating']],
  'ice skating':     [15.5, ['Skating']],
  skiing:            [15.5, ['Skiing']],
  'ski resort':      [15.5, ['Skiing']],
  swimming:          [15.5, ['Swimming']],
  pool:              [15.5, ['Swimming']],
  tennis:            [15.5, ['Tennis']],
  'tennis court':    [15.5, ['Tennis']],
  soccer:            [15.5, ['Soccer']],
  football:          [15.5, ['Soccer']],
  volleyball:        [15.5, ['Volleyball']],
  surfing:           [15.5, ['Surfing']],
  surf:              [15.5, ['Surfing']],
  kayaking:          [15.5, ['Kayaking']],
  kayak:             [15.5, ['Kayaking']],
  'rock climbing':   [15.5, ['RockClimbing']],
  climbing:          [15.5, ['RockClimbing']],

  // Services (minZoom: 15.5)
  bank:              [15.5, ['Bank']],
  banks:             [15.5, ['Bank']],
  atm:               [15.5, ['ATM']],
  atms:              [15.5, ['ATM']],
  hospital:          [15.5, ['Hospital']],
  hospitals:         [15.5, ['Hospital']],
  emergency:         [15.5, ['Hospital']],
  pharmacy:          [15.5, ['Pharmacy']],
  pharmacies:        [15.5, ['Pharmacy']],
  drugstore:         [15.5, ['Pharmacy']],
  police:            [15.5, ['Police']],
  'police station':  [15.5, ['Police']],
  'fire station':    [15.5, ['FireStation']],
  fire:              [15.5, ['FireStation']],
  'post office':     [15.5, ['PostOffice']],
  post:              [15.5, ['PostOffice']],
  mail:              [15.5, ['PostOffice']],
  laundry:           [15.5, ['Laundry']],
  laundromat:        [15.5, ['Laundry']],
  gas:               [15.5, ['GasStation']],
  'gas station':     [15.5, ['GasStation']],
  fuel:              [15.5, ['GasStation']],
  petrol:            [15.5, ['GasStation']],
  ev:                [15.5, ['EVCharger']],
  'ev charger':      [15.5, ['EVCharger']],
  'electric charger': [15.5, ['EVCharger']],
  'charging station': [15.5, ['EVCharger']],
  parking:           [15.5, ['Parking']],
  'car rental':      [15.5, ['CarRental']],
  rental:            [15.5, ['CarRental']],
  automotive:        [15.5, ['Automotive']],
  'car repair':      [15.5, ['Automotive']],
  mechanic:          [15.5, ['Automotive']],

  // Travel & Transportation (minZoom: 15)
  hotel:             [15, ['Hotel']],
  hotels:            [15, ['Hotel']],
  motel:             [15, ['Hotel']],
  lodging:           [15, ['Hotel']],
  airport:           [15, ['Airport']],
  airports:          [15, ['Airport']],
  'public transport': [15, ['PublicTransport']],
  transit:           [15, ['PublicTransport']],
  bus:               [15, ['PublicTransport']],
  train:             [15, ['PublicTransport']],
  subway:            [15, ['PublicTransport']],
  'rv park':         [15, ['RVPark']],
  rv:                [15, ['RVPark']],

  // Shopping (minZoom: 15.5)
  store:             [15.5, ['Store']],
  stores:            [15.5, ['Store']],
  shop:              [15.5, ['Store']],
  shops:             [15.5, ['Store']],
  shopping:          [15.5, ['Store']],
  mall:              [15.5, ['Store']],

  // Culture & Education (minZoom: 15.5)
  museum:            [15.5, ['Museum']],
  museums:           [15.5, ['Museum']],
  library:           [15.5, ['Library']],
  libraries:         [15.5, ['Library']],
  landmark:          [15.5, ['Landmark']],
  landmarks:         [15.5, ['Landmark']],
  castle:            [15.5, ['Castle']],
  castles:           [15.5, ['Castle']],
  fortress:          [15.5, ['Fortress']],
  school:            [15.5, ['School']],
  schools:           [15.5, ['School']],
  university:        [15.5, ['University']],
  universities:      [15.5, ['University']],
  college:           [15.5, ['University']],

  // Personal Care & Health (minZoom: 15.5)
  spa:               [15.5, ['Spa']],
  spas:              [15.5, ['Spa']],
  beauty:            [15.5, ['Beauty']],
  'beauty salon':    [15.5, ['Beauty']],
  'hair salon':      [15.5, ['HairSalon']],
  haircut:           [15.5, ['HairSalon']],
  barber:            [15.5, ['HairSalon']],
  dentist:           [15.5, ['Dentist']],
  dental:            [15.5, ['Dentist']],
  doctor:            [15.5, ['Doctor']],
  clinic:            [15.5, ['Doctor']],
  'medical center':  [15.5, ['Doctor']],

  // Other (minZoom: 13)
  'convention center': [13, ['ConventionCenter']],
  convention:        [13, ['ConventionCenter']],
  fairground:        [13, ['Fairground']],
  fair:              [13, ['Fairground']],
  karting:           [13, ['Karting']],
  'go kart':         [13, ['Karting']],
};

export class SearchBar {
  private container: HTMLElement;
  private mapProvider: MapProvider;
  private search: any = null;
  private clearTapCount = 0;
  private autocompleteRequestId: number | null = null;

  constructor(container: HTMLElement, mapProvider: MapProvider) {
    this.container = container;
    this.mapProvider = mapProvider;
    this.render();
    this.initSearch();
    this.setupDebugToggle();
  }

  private setupDebugToggle(): void {
    // Reset tap count when clicking anywhere except the clear button
    document.addEventListener('click', (e) => {
      const clearBtn = this.container.querySelector('#search-clear');
      if (clearBtn && !clearBtn.contains(e.target as Node)) {
        this.clearTapCount = 0;
      }
    });

    // Reset tap count when dragging anywhere
    document.addEventListener('pointerdown', (e) => {
      const clearBtn = this.container.querySelector('#search-clear');
      if (clearBtn && !clearBtn.contains(e.target as Node)) {
        this.clearTapCount = 0;
      }
    });
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
        <button id="search-clear" class="search-clear" type="button">&times;</button>
        <div id="search-results" class="search-results hidden"></div>
      </div>
    `;

    const input = this.container.querySelector('#search-input') as HTMLInputElement;
    const clearBtn = this.container.querySelector('#search-clear') as HTMLButtonElement;
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
        input.value = '';
        this.hideResults();
        this.clearPOIFilter();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.hideResults();
        input.blur();
        this.handleSearchSubmit(input.value.trim());
      }
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      this.hideResults();
      this.clearPOIFilter();
      input.focus();

      // Track taps for debug controls toggle
      this.clearTapCount++;
      if (this.clearTapCount >= 4) {
        const debugControls = document.getElementById('debug-controls');
        if (debugControls) {
          debugControls.classList.toggle('hidden');
        }
        this.clearTapCount = 0;
      }
    });

    // Hide suggestions when clicking/tapping anywhere except on the suggestions themselves
    document.addEventListener('pointerdown', (e) => {
      const resultsEl = this.container.querySelector('#search-results');
      if (resultsEl && !resultsEl.contains(e.target as Node)) {
        this.hideResults();
      }
    });
  }

  private initSearch(): void {
    if (typeof mapkit !== 'undefined') {
      this.search = new mapkit.Search();
    }
  }

  private buildCurrentRegion(): any {
    const bounds = this.mapProvider.getBounds();
    const center = this.mapProvider.getCenter();
    const span = new mapkit.CoordinateSpan(
      bounds.north - bounds.south,
      bounds.east - bounds.west
    );
    return new mapkit.CoordinateRegion(
      new mapkit.Coordinate(center.lat, center.lng),
      span
    );
  }

  private performSearch(query: string): void {
    // Cancel any in-flight autocomplete request
    if (this.autocompleteRequestId !== null && this.search) {
      this.search.cancel(this.autocompleteRequestId);
      this.autocompleteRequestId = null;
    }

    if (!query.trim() || !this.search) {
      this.hideResults();
      return;
    }

    const region = this.buildCurrentRegion();

    this.autocompleteRequestId = this.search.autocomplete(
      query,
      (error: any, data: any) => {
        this.autocompleteRequestId = null;
        if (error) {
          this.hideResults();
          return;
        }
        this.showAutocompleteResults(data.results, query);
      },
      { region }
    );
  }

  private showAutocompleteResults(results: any[], originalQuery: string): void {
    const resultsEl = this.container.querySelector('#search-results') as HTMLElement;
    if (!results || results.length === 0) {
      this.hideResults();
      return;
    }

    resultsEl.innerHTML = results
      .slice(0, 5)
      .map((result: any, i: number) => {
        const lines = result.displayLines || [];
        return `
          <div class="search-result-item" data-index="${i}">
            <span class="result-name">${lines[0] || ''}</span>
            <span class="result-address">${lines.slice(1).join(', ')}</span>
          </div>
        `;
      })
      .join('');

    resultsEl.classList.remove('hidden');

    resultsEl.querySelectorAll('.search-result-item').forEach((item, i) => {
      item.addEventListener('click', () => {
        const result = results[i];
        const input = this.container.querySelector('#search-input') as HTMLInputElement;
        const displayName = result.displayLines?.[0] || originalQuery;
        input.value = displayName;
        this.hideResults();
        this.handleSearchSubmit(displayName);
      });
    });
  }

  private handleSearchSubmit(query: string): void {
    if (!query) {
      this.clearPOIFilter();
      return;
    }

    const normalizedQuery = query.toLowerCase().trim();

    // Special case: "none" hides all POIs
    if (normalizedQuery === 'none') {
      this.mapProvider.filterPOIByCategories([]);
      this.mapProvider.clearMarkers();
      return;
    }

    // Check if query matches a POI category
    const poiMatch = SEARCH_TO_POI_CATEGORIES[normalizedQuery];

    if (poiMatch) {
      const [minZoom, categories] = poiMatch;
      // POI category match - filter and navigate to nearest match
      this.mapProvider.filterPOIByCategories(categories);
      this.mapProvider.clearMarkers();

      // Search for the category and navigate to the first result
      const region = this.buildCurrentRegion();
      const currentZoom = this.mapProvider.getZoom();
      this.search.search(query, (error: any, data: any) => {
        if (error || !data.places || data.places.length === 0) return;
        const place = data.places[0];
        // Use combined pan+zoom for single smooth animation
        const targetZoom = Math.max(currentZoom, minZoom);
        this.mapProvider.setCenterAndZoom(place.coordinate.latitude, place.coordinate.longitude, targetZoom);
      }, { region });
      return;
    }

    // No POI category match - search for the place, navigate, and add pin
    this.clearPOIFilter(); // Show all POIs
    this.mapProvider.clearMarkers(); // Clear any existing search pins

    const region = this.buildCurrentRegion();
    this.search.search(query, (error: any, data: any) => {
      if (error || !data.places || data.places.length === 0) return;

      const place = data.places[0];
      this.mapProvider.setCenterAndZoom(place.coordinate.latitude, place.coordinate.longitude, 15);

      // Add a pin - use simple address card (no placeId) since we have the data
      this.mapProvider.addMarkers([{
        id: place.id || `search-${Date.now()}`,
        lat: place.coordinate.latitude,
        lng: place.coordinate.longitude,
        title: place.name || query,
        subtitle: place.formattedAddress || '',
      }]);
    }, { region });
  }

  private clearPOIFilter(): void {
    this.mapProvider.clearPOIFilter();
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
