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

    let newLat = center.latitude - dy * latPerPixel;
    let newLng = center.longitude + dx * lngPerPixel;

    // Normalize longitude to -180 to 180 range
    while (newLng > 180) newLng -= 360;
    while (newLng < -180) newLng += 360;

    // Clamp latitude to -85 to 85 range (Web Mercator limits)
    newLat = Math.max(-85, Math.min(85, newLat));

    this.map.setCenterAnimated(new mapkit.Coordinate(newLat, newLng), false);
  }

  zoomAtPoint(x: number, y: number, zoomDelta: number): void {
    if (!this.map || !this.container) return;

    const rect = this.container.getBoundingClientRect();

    // Step 1: Remember the geographic coordinate under the cursor BEFORE zoom
    const cursorPageX = rect.left + x;
    const cursorPageY = rect.top + y;
    const cursorPoint = new DOMPoint(cursorPageX, cursorPageY);
    const targetCoord = this.map.convertPointOnPageToCoordinate(cursorPoint);

    // Step 2: Apply zoom at equator to avoid latitude-dependent zoom restrictions
    const oldZoom = this.getZoom();
    const originalCenter = this.map.center;

    // Step 2a: Pan to equator
    this.map.setCenterAnimated(new mapkit.Coordinate(0, originalCenter.longitude), false);

    // Step 2b: Read the actual zoom level at equator (panning might have changed it)
    const zoomAtEquator = this.getZoom();

    // Get current span to preserve aspect ratio
    const currentSpan = this.map.region.span;
    const aspectRatio = currentSpan.longitudeDelta / currentSpan.latitudeDelta;

    // Step 2c: Calculate new zoom with delta
    const requestedZoom = Math.max(1, Math.min(20, zoomAtEquator + zoomDelta));
    const newLatSpan = 360 / Math.pow(2, requestedZoom);
    const newLngSpan = newLatSpan * aspectRatio;

    // Step 2d: Apply zoom change at equator
    let equatorZoomRegion = new mapkit.CoordinateRegion(
      new mapkit.Coordinate(0, originalCenter.longitude),
      new mapkit.CoordinateSpan(newLatSpan, newLngSpan)
    );
    this.map.setRegionAnimated(equatorZoomRegion, false);

    // Step 2e: Read zoom again - if MapKit clamped it when zooming out, add epsilon
    const actualZoomAtEquator = this.getZoom();
    if (zoomDelta < 0 && Math.abs(actualZoomAtEquator - requestedZoom) > 0.001) {
      // MapKit clamped our zoom out request - add epsilon to stay away from limit
      const adjustedZoom = actualZoomAtEquator + 0.0001;
      const adjLatSpan = 360 / Math.pow(2, adjustedZoom);
      const adjLngSpan = adjLatSpan * aspectRatio;
      equatorZoomRegion = new mapkit.CoordinateRegion(
        new mapkit.Coordinate(0, originalCenter.longitude),
        new mapkit.CoordinateSpan(adjLatSpan, adjLngSpan)
      );
      this.map.setRegionAnimated(equatorZoomRegion, false);
    }

    // Step 2f: Pan back to original location
    this.map.setCenterAnimated(originalCenter, false);

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
