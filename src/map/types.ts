export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
}

export interface MapOptions {
  center: LatLng;
  zoom: number;
  rotation?: number;
}

export interface MapProvider {
  init(container: HTMLElement, options: MapOptions): Promise<void>;
  setCenter(lat: number, lng: number, animated?: boolean): void;
  getCenter(): LatLng;
  setZoom(level: number, animated?: boolean): void;
  getZoom(): number;
  setRotation(degrees: number, animated?: boolean): void;
  getRotation(): number;
  panBy(dx: number, dy: number): void;
  zoomAtPoint(x: number, y: number, zoomDelta: number): void;
  getBounds(): MapBounds;
  setNativeInteractionsEnabled(enabled: boolean): void;
  addMarkers(markers: MapMarker[]): void;
  clearMarkers(): void;
  onMarkerSelect(callback: (marker: MapMarker) => void): void;
  filterPOIByCategories(categories: string[]): void;
  clearPOIFilter(): void;
  searchPOIsInView(categories: string[], maxResults: number): Promise<MapMarker[]>;
  destroy(): void;
}

export type MapProviderType = 'apple' | 'google';
