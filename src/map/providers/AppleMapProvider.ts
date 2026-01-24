import { MapProvider, MapOptions, LatLng, MapBounds } from '../types';
import { config } from '../../config';

declare const mapkit: any;

export class AppleMapProvider implements MapProvider {
  private map: any = null;
  private container: HTMLElement | null = null;

  async init(container: HTMLElement, options: MapOptions): Promise<void> {
    this.container = container;

    await this.waitForMapKit();

    await new Promise<void>((resolve, reject) => {
      mapkit.init({
        authorizationCallback: (done: (token: string) => void) => {
          const token = config.mapkit.token;
          if (!token) {
            reject(new Error('MapKit JS token not configured. Set VITE_MAPKIT_TOKEN in .env'));
            return;
          }
          done(token);
        },
      });

      this.map = new mapkit.Map(container, {
        center: new mapkit.Coordinate(options.center.lat, options.center.lng),
        rotation: options.rotation ?? 0,
        showsCompass: mapkit.FeatureVisibility.Hidden,
        showsZoomControl: false,
        showsMapTypeControl: false,
        isScrollEnabled: false,
        isZoomEnabled: false,
        isRotateEnabled: false,
      });

      this.setZoom(options.zoom, false);
      resolve();
    });
  }

  private waitForMapKit(): Promise<void> {
    return new Promise((resolve) => {
      if (typeof mapkit !== 'undefined') {
        resolve();
        return;
      }
      const check = setInterval(() => {
        if (typeof mapkit !== 'undefined') {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });
  }

  setCenter(lat: number, lng: number, animated = true): void {
    if (!this.map) return;
    const coord = new mapkit.Coordinate(lat, lng);
    this.map.setCenterAnimated(coord, animated);
  }

  getCenter(): LatLng {
    if (!this.map) return { lat: 0, lng: 0 };
    const center = this.map.center;
    return { lat: center.latitude, lng: center.longitude };
  }

  setZoom(level: number, animated = true): void {
    if (!this.map) return;
    // MapKit JS uses camera distance or span, not a simple zoom level.
    // We convert zoom level (0-20) to a span in degrees.
    const span = 360 / Math.pow(2, level);
    const region = new mapkit.CoordinateRegion(
      this.map.center,
      new mapkit.CoordinateSpan(span, span)
    );
    this.map.setRegionAnimated(region, animated);
  }

  getZoom(): number {
    if (!this.map) return 0;
    const span = this.map.region.span.latitudeDelta;
    // Inverse of: span = 360 / 2^zoom
    return Math.log2(360 / span);
  }

  setRotation(degrees: number, animated = true): void {
    if (!this.map) return;
    this.map.setRotationAnimated(degrees, animated);
  }

  getRotation(): number {
    if (!this.map) return 0;
    return this.map.rotation;
  }

  panBy(dx: number, dy: number): void {
    if (!this.map || !this.container) return;
    const center = this.map.center;
    const span = this.map.region.span;
    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;

    // Convert pixel offset to coordinate offset
    const lngPerPixel = span.longitudeDelta / containerWidth;
    const latPerPixel = span.latitudeDelta / containerHeight;

    const newLat = center.latitude - dy * latPerPixel;
    const newLng = center.longitude + dx * lngPerPixel;

    this.map.setCenterAnimated(new mapkit.Coordinate(newLat, newLng), false);
  }

  zoomAtPoint(x: number, y: number, zoomDelta: number): void {
    if (!this.map || !this.container) return;

    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;
    const center = this.map.center;
    const span = this.map.region.span;

    // Calculate the coordinate at the pointer position
    const offsetX = (x - containerWidth / 2) / containerWidth;
    const offsetY = (containerHeight / 2 - y) / containerHeight;

    const pointLat = center.latitude + offsetY * span.latitudeDelta;
    const pointLng = center.longitude + offsetX * span.longitudeDelta;

    // Apply zoom
    const currentZoom = this.getZoom();
    const newZoom = Math.max(1, Math.min(20, currentZoom + zoomDelta));
    const newSpan = 360 / Math.pow(2, newZoom);

    // Adjust center so that the point under the cursor stays fixed
    const scale = newSpan / (span.latitudeDelta);
    const newCenterLat = pointLat - offsetY * newSpan;
    const newCenterLng = pointLng - offsetX * newSpan;

    const region = new mapkit.CoordinateRegion(
      new mapkit.Coordinate(newCenterLat, newCenterLng),
      new mapkit.CoordinateSpan(newSpan, newSpan)
    );
    this.map.setRegionAnimated(region, false);
  }

  getBounds(): MapBounds {
    if (!this.map) return { north: 0, south: 0, east: 0, west: 0 };
    const region = this.map.region;
    const center = region.center;
    const span = region.span;
    return {
      north: center.latitude + span.latitudeDelta / 2,
      south: center.latitude - span.latitudeDelta / 2,
      east: center.longitude + span.longitudeDelta / 2,
      west: center.longitude - span.longitudeDelta / 2,
    };
  }

  destroy(): void {
    if (this.map) {
      this.map.destroy();
      this.map = null;
    }
    this.container = null;
  }
}
