import { MapProvider } from '../map/types';

declare const mapkit: any;

// Map common search terms to MapKit POI categories
const SEARCH_TO_POI_CATEGORIES: Record<string, string[]> = {
  // Food & Drink
  food: ['Restaurant', 'Cafe', 'Bakery', 'FoodMarket'],
  restaurant: ['Restaurant'],
  restaurants: ['Restaurant'],
  cafe: ['Cafe'],
  cafes: ['Cafe'],
  coffee: ['Cafe'],
  bakery: ['Bakery'],
  bakeries: ['Bakery'],
  grocery: ['FoodMarket'],
  groceries: ['FoodMarket'],
  supermarket: ['FoodMarket'],
  'food market': ['FoodMarket'],
  winery: ['Winery'],
  wine: ['Winery'],
  brewery: ['Brewery'],
  beer: ['Brewery'],
  distillery: ['Distillery'],

  // Nightlife & Entertainment
  bar: ['Nightlife'],
  bars: ['Nightlife'],
  nightlife: ['Nightlife'],
  club: ['Nightlife'],
  clubs: ['Nightlife'],
  pub: ['Nightlife'],
  pubs: ['Nightlife'],
  movie: ['MovieTheater'],
  movies: ['MovieTheater'],
  cinema: ['MovieTheater'],
  'movie theater': ['MovieTheater'],
  theater: ['Theater'],
  theatre: ['Theater'],
  music: ['MusicVenue'],
  'music venue': ['MusicVenue'],
  concert: ['MusicVenue'],
  amusement: ['Amusement'],
  'amusement park': ['Amusement'],
  'theme park': ['Amusement'],
  casino: ['Casino'],
  casinos: ['Casino'],

  // Outdoors & Nature
  park: ['Park'],
  parks: ['Park'],
  'national park': ['NationalPark'],
  beach: ['Beach'],
  beaches: ['Beach'],
  campground: ['Campground'],
  camping: ['Campground'],
  marina: ['Marina'],
  boat: ['Marina'],
  zoo: ['Zoo'],
  zoos: ['Zoo'],
  aquarium: ['Aquarium'],

  // Sports & Fitness
  gym: ['FitnessCenter'],
  fitness: ['FitnessCenter'],
  'fitness center': ['FitnessCenter'],
  golf: ['Golf'],
  'golf course': ['Golf'],
  stadium: ['Stadium'],
  stadiums: ['Stadium'],
  skating: ['Skating'],
  'ice skating': ['Skating'],
  skiing: ['Skiing'],
  'ski resort': ['Skiing'],
  swimming: ['Swimming'],
  pool: ['Swimming'],
  tennis: ['Tennis'],
  'tennis court': ['Tennis'],
  soccer: ['Soccer'],
  football: ['Soccer'],
  volleyball: ['Volleyball'],
  surfing: ['Surfing'],
  surf: ['Surfing'],
  kayaking: ['Kayaking'],
  kayak: ['Kayaking'],
  'rock climbing': ['RockClimbing'],
  climbing: ['RockClimbing'],

  // Services
  bank: ['Bank'],
  banks: ['Bank'],
  atm: ['ATM'],
  atms: ['ATM'],
  hospital: ['Hospital'],
  hospitals: ['Hospital'],
  emergency: ['Hospital'],
  pharmacy: ['Pharmacy'],
  pharmacies: ['Pharmacy'],
  drugstore: ['Pharmacy'],
  police: ['Police'],
  'police station': ['Police'],
  'fire station': ['FireStation'],
  fire: ['FireStation'],
  'post office': ['PostOffice'],
  post: ['PostOffice'],
  mail: ['PostOffice'],
  laundry: ['Laundry'],
  laundromat: ['Laundry'],
  gas: ['GasStation'],
  'gas station': ['GasStation'],
  fuel: ['GasStation'],
  petrol: ['GasStation'],
  ev: ['EVCharger'],
  'ev charger': ['EVCharger'],
  'electric charger': ['EVCharger'],
  'charging station': ['EVCharger'],
  parking: ['Parking'],
  'car rental': ['CarRental'],
  rental: ['CarRental'],
  automotive: ['Automotive'],
  'car repair': ['Automotive'],
  mechanic: ['Automotive'],

  // Travel & Transportation
  hotel: ['Hotel'],
  hotels: ['Hotel'],
  motel: ['Hotel'],
  lodging: ['Hotel'],
  airport: ['Airport'],
  airports: ['Airport'],
  'public transport': ['PublicTransport'],
  transit: ['PublicTransport'],
  bus: ['PublicTransport'],
  train: ['PublicTransport'],
  subway: ['PublicTransport'],
  'rv park': ['RVPark'],
  rv: ['RVPark'],

  // Shopping
  store: ['Store'],
  stores: ['Store'],
  shop: ['Store'],
  shops: ['Store'],
  shopping: ['Store'],
  mall: ['Store'],

  // Culture & Education
  museum: ['Museum'],
  museums: ['Museum'],
  library: ['Library'],
  libraries: ['Library'],
  landmark: ['Landmark'],
  landmarks: ['Landmark'],
  castle: ['Castle'],
  castles: ['Castle'],
  fortress: ['Fortress'],
  school: ['School'],
  schools: ['School'],
  university: ['University'],
  universities: ['University'],
  college: ['University'],

  // Personal Care & Health
  spa: ['Spa'],
  spas: ['Spa'],
  beauty: ['Beauty'],
  'beauty salon': ['Beauty'],
  'hair salon': ['HairSalon'],
  haircut: ['HairSalon'],
  barber: ['HairSalon'],
  dentist: ['Dentist'],
  dental: ['Dentist'],
  doctor: ['Doctor'],
  clinic: ['Doctor'],
  'medical center': ['Doctor'],

  // Other
  'convention center': ['ConventionCenter'],
  convention: ['ConventionCenter'],
  fairground: ['Fairground'],
  fair: ['Fairground'],
  karting: ['Karting'],
  'go kart': ['Karting'],
};

export class SearchBar {
  private container: HTMLElement;
  private mapProvider: MapProvider;
  private search: any = null;
  private isFiltered = false;
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
        this.filterPOIs(input.value.trim());
        this.hideResults();
        input.blur();
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

        // If result has a coordinate, go there directly
        if (result.coordinate) {
          this.mapProvider.setCenter(result.coordinate.latitude, result.coordinate.longitude);
          this.mapProvider.setZoom(15);
        } else {
          // Otherwise do a full search constrained to current region
          const region = this.buildCurrentRegion();
          this.search.search(displayName, (error: any, data: any) => {
            if (error || !data.places || data.places.length === 0) return;
            const place = data.places[0];
            this.mapProvider.setCenter(place.coordinate.latitude, place.coordinate.longitude);
            this.mapProvider.setZoom(15);
          }, { region });
        }
      });
    });
  }

  private filterPOIs(query: string): void {
    if (!query) {
      this.clearPOIFilter();
      return;
    }

    const normalizedQuery = query.toLowerCase().trim();

    // Special case: "none" hides all POIs
    if (normalizedQuery === 'none') {
      this.mapProvider.filterPOIByCategories([]);
      this.isFiltered = true;
      return;
    }

    let categories: string[] | undefined;

    // 1. Check our custom mapping for exact match (food -> Restaurant, Cafe, etc.)
    categories = SEARCH_TO_POI_CATEGORIES[normalizedQuery];

    // 2. Try using the query directly as a category name (e.g., "Restaurant" -> Restaurant)
    if (!categories) {
      const asCategory = query
        .split(/\s+/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
      categories = [asCategory];
    }

    // Filter the map to only show these POI types
    this.mapProvider.filterPOIByCategories(categories);
    this.isFiltered = true;
  }

  private clearPOIFilter(): void {
    this.mapProvider.clearPOIFilter();

    this.isFiltered = false;
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
