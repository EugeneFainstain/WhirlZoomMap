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

    // Use setRegionAnimated instead of setCenterAnimated
    // This seems to work better at minimal zoom levels
    const region = new mapkit.CoordinateRegion(
      new mapkit.Coordinate(newLat, newLng),
      new mapkit.CoordinateSpan(span.latitudeDelta, span.longitudeDelta)
    );
    this.map.setRegionAnimated(region, false);
  }

  zoomAtPoint(x: number, y: number, zoomDelta: number): void {
    if (!this.map || !this.container) return;

    const rect = this.container.getBoundingClientRect();

    // Step 1: Remember the geographic coordinate under the cursor BEFORE zoom
    const cursorPageX = rect.left + x;
    const cursorPageY = rect.top + y;
    const cursorPoint = new DOMPoint(cursorPageX, cursorPageY);
    const targetCoord = this.map.convertPointOnPageToCoordinate(cursorPoint);

    // Step 2: Apply zoom (this may get clamped at min/max)
    const oldZoom = this.getZoom();
    const newZoom = Math.max(1, Math.min(20, oldZoom + zoomDelta));
    const newSpan = 360 / Math.pow(2, newZoom);

    // Set the new zoom level without changing center
    const currentCenter = this.map.center;
    const region = new mapkit.CoordinateRegion(
      currentCenter,
      new mapkit.CoordinateSpan(newSpan, newSpan)
    );
    this.map.setRegionAnimated(region, false);

    // Check if zoom actually changed (compare before and after)
    const actualZoom = this.getZoom();
    if (Math.abs(actualZoom - oldZoom) < 0.001) {
      // Zoom was clamped and didn't change, so don't do compensating pan
      // (otherwise we'd undo the pan that was done before calling this method)
      return;
    }

    // Step 3: Pan so that the target coordinate is back under the cursor
    // Get where the target coordinate is now displayed after zoom
    const targetPagePoint = this.map.convertCoordinateToPointOnPage(targetCoord);

    // Calculate how many pixels we need to pan
    const panPixelsX = targetPagePoint.x - cursorPageX;
    const panPixelsY = targetPagePoint.y - cursorPageY;

    // Apply the pan
    this.panBy(panPixelsX, panPixelsY);
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

  setNativeInteractionsEnabled(enabled: boolean): void {
    if (!this.map) return;
    this.map.isScrollEnabled = enabled;
    this.map.isZoomEnabled = enabled;
    this.map.isRotateEnabled = enabled;
  }

  destroy(): void {
    if (this.map) {
      this.map.destroy();
      this.map = null;
    }
    this.container = null;
  }
}
