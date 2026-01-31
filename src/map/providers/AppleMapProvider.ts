import { MapProvider, MapOptions, LatLng, MapBounds, MapMarker, RouteInfo } from '../types';
import { config } from '../../config';

declare const mapkit: any;

export class AppleMapProvider implements MapProvider {
  private map: any = null;
  private container: HTMLElement | null = null;
  private markerMap = new Map<any, MapMarker>();
  private markerSelectCallback: ((marker: MapMarker) => void) | null = null;
  private placeDetailContainer: HTMLElement | null = null;
  private currentPlaceDetail: any = null;
  private currentPlaceCoordinate: LatLng | null = null;
  private selectedPOI: { id: string; annotation: any; selectedAt: number } | null = null;
  private routeOverlay: any = null;
  private isLoadingDirections = false;
  private hasActiveRoute = false;

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
        isZoomEnabled: true,
        isRotateEnabled: true,
        // Enable POI selection
        selectableMapFeatures: [
          mapkit.MapFeatureType.PointOfInterest,
        ],
      });

      this.setZoom(options.zoom, false);

      // Listen for POI selection events - just track, don't show card yet
      this.map.addEventListener('select', (event: any) => {
        const ann = event.annotation;
        if (ann?.id && ann.featureType === 'PointOfInterest') {
          // If tapping on already-selected POI, show the card
          if (this.selectedPOI?.id === ann.id) {
            this.showPlaceDetail(ann.id);
          } else {
            // First tap - just track, don't show card
            this.selectedPOI = { id: ann.id, annotation: ann, selectedAt: Date.now() };
          }
        }
      });

      // Also listen for clicks on the container to detect taps on already-selected POI
      container.addEventListener('click', (e: MouseEvent) => {
        if (!this.selectedPOI || this.currentPlaceDetail) return;

        // Ignore clicks within 100ms of selection (same tap that selected the POI)
        if (Date.now() - this.selectedPOI.selectedAt < 100) return;

        // Check if click was near the selected annotation
        // The enlarged POI icon is displayed ABOVE the coordinate point (pin tip),
        // so we offset Y upward by ~35px to match the visual icon center
        const annCoord = this.selectedPOI.annotation.coordinate;
        const annPoint = this.map.convertCoordinateToPointOnPage(annCoord);
        const iconCenterY = annPoint.y - 35;

        const dx = e.pageX - annPoint.x;
        const dy = e.pageY - iconCenterY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // If click is within 45px of the icon center, show the card
        if (distance < 45) {
          this.showPlaceDetail(this.selectedPOI.id);
        }
      });

      // Listen for deselect to hide the place detail
      this.map.addEventListener('deselect', () => {
        this.selectedPOI = null;
        this.hidePlaceDetail();
      });

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

    // Rotate the pan vector by the map's rotation angle
    const rotation = this.map.rotation;
    const radians = rotation * (Math.PI / 180);
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const rotatedDx = dx * cos + dy * sin;
    const rotatedDy = -dx * sin + dy * cos;

    // Convert pixel offset to coordinate offset
    const lngPerPixel = span.longitudeDelta / containerWidth;
    const latPerPixel = span.latitudeDelta / containerHeight;

    let newLat = center.latitude - rotatedDy * latPerPixel;
    let newLng = center.longitude + rotatedDx * lngPerPixel;

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
    const originalRotation = this.getRotation(); // Save rotation before equator workaround

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

    // Restore rotation (panning may have reset it)
    this.setRotation(originalRotation, false);

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
    // Only toggle scroll - zoom and rotate stay enabled for native handling
    this.map.isScrollEnabled = enabled;
  }

  addMarkers(markers: MapMarker[]): void {
    if (!this.map) return;

    const annotations = markers.map((marker) => {
      const annotation = new mapkit.MarkerAnnotation(
        new mapkit.Coordinate(marker.lat, marker.lng),
        {
          title: marker.title,
          subtitle: marker.subtitle || '',
          color: '#e74c3c',
        }
      );
      this.markerMap.set(annotation, marker);
      return annotation;
    });

    this.map.addAnnotations(annotations);

    // Set up selection handler if not already done
    this.map.addEventListener('select', (event: any) => {
      const annotation = event.annotation;
      const marker = this.markerMap.get(annotation);
      if (marker && this.markerSelectCallback) {
        this.markerSelectCallback(marker);
      }
    });
  }

  clearMarkers(): void {
    if (!this.map) return;
    this.map.removeAnnotations(this.map.annotations);
    this.markerMap.clear();
  }

  onMarkerSelect(callback: (marker: MapMarker) => void): void {
    this.markerSelectCallback = callback;
  }

  filterPOIByCategories(categories: string[]): void {
    if (!this.map) return;

    if (categories.length === 0) {
      // Hide all POIs
      this.map.pointOfInterestFilter = mapkit.PointOfInterestFilter.including([]);
      return;
    }

    // Map category strings to MapKit POI categories
    const poiCategories = categories
      .map((cat) => mapkit.PointOfInterestCategory[cat])
      .filter((cat) => cat !== undefined);

    if (poiCategories.length > 0) {
      this.map.pointOfInterestFilter = mapkit.PointOfInterestFilter.including(poiCategories);
    }
  }

  clearPOIFilter(): void {
    if (!this.map) return;
    // Reset to show all POIs
    this.map.pointOfInterestFilter = null;
  }

  async searchPOIsInView(categories: string[], maxResults: number): Promise<MapMarker[]> {
    if (!this.map) return [];

    // Convert category strings to MapKit POI categories
    const poiCategories = categories
      .map((cat) => mapkit.PointOfInterestCategory[cat])
      .filter((cat) => cat !== undefined);

    if (poiCategories.length === 0) return [];

    // Create a POI search with a filter for the specified categories
    const filter = mapkit.PointOfInterestFilter.including(poiCategories);
    const search = new mapkit.PointsOfInterestSearch({
      pointOfInterestFilter: filter,
      region: this.map.region,
    });

    return new Promise((resolve) => {
      search.search((error: any, data: any) => {
        if (error || !data.places) {
          console.warn('POI search error:', error);
          resolve([]);
          return;
        }

        // Convert places to MapMarker format, limit to maxResults
        const markers: MapMarker[] = data.places.slice(0, maxResults).map((place: any, i: number) => ({
          id: `poi-${i}`,
          lat: place.coordinate.latitude,
          lng: place.coordinate.longitude,
          title: place.name || '',
          subtitle: place.formattedAddress || '',
        }));

        resolve(markers);
      });
    });
  }

  private showPlaceDetail(placeId: string): void {
    // Get the wrapper container
    const wrapper = document.getElementById('place-detail-container');
    if (!wrapper) return;

    // Clear any existing place detail
    this.hidePlaceDetail();

    // Show loading placeholder immediately
    this.placeDetailContainer = document.createElement('div');
    this.placeDetailContainer.className = 'place-detail-loading';
    this.placeDetailContainer.innerHTML = `
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <span>Loading...</span>
      </div>
    `;
    wrapper.appendChild(this.placeDetailContainer);
    wrapper.style.display = 'block';

    // Look up the place
    const lookup = new mapkit.PlaceLookup();
    lookup.getPlace(placeId, (error: any, place: any) => {
      if (error || !place) {
        console.warn('PlaceLookup error:', error);
        this.hidePlaceDetail();
        return;
      }

      // Store place coordinate for directions
      this.currentPlaceCoordinate = {
        lat: place.coordinate.latitude,
        lng: place.coordinate.longitude,
      };

      // Clear loading placeholder
      wrapper.innerHTML = '';

      // Create main container
      const mainContainer = document.createElement('div');
      mainContainer.className = 'place-detail-hybrid';
      wrapper.appendChild(mainContainer);

      // Create container for MapKit's PlaceDetail
      const placeDetailEl = document.createElement('div');
      placeDetailEl.className = 'mapkit-place-detail-container';
      mainContainer.appendChild(placeDetailEl);

      // Create MapKit PlaceDetail with displaysMap: false (testing if this works)
      this.currentPlaceDetail = new mapkit.PlaceDetail(placeDetailEl, place, {
        colorScheme: mapkit.PlaceDetail.ColorSchemes.Adaptive,
        displaysMap: false,  // Try to hide the map snippet
      });

      // Add custom directions button row
      const actionsRow = document.createElement('div');
      actionsRow.className = 'place-detail-actions';
      actionsRow.innerHTML = `
        <button class="place-action-btn directions-btn">
          🚗 Directions
        </button>
        <button class="place-action-btn close-btn">
          ✕ Close
        </button>
      `;
      mainContainer.appendChild(actionsRow);

      // Add route info container (hidden initially)
      const routeInfoEl = document.createElement('div');
      routeInfoEl.className = 'place-detail-route';
      routeInfoEl.style.display = 'none';
      mainContainer.insertBefore(routeInfoEl, actionsRow);

      // Bind button events
      const directionsBtn = actionsRow.querySelector('.directions-btn') as HTMLButtonElement;
      const closeBtn = actionsRow.querySelector('.close-btn') as HTMLButtonElement;

      directionsBtn.addEventListener('click', () => {
        if (this.hasActiveRoute) {
          this.clearRouteAndUpdateUI(routeInfoEl, directionsBtn);
        } else {
          this.requestDirectionsAndShow(routeInfoEl, directionsBtn);
        }
      });

      closeBtn.addEventListener('click', () => {
        this.hidePlaceDetail();
      });

      this.placeDetailContainer = mainContainer;
    });
  }

  private async requestDirectionsAndShow(
    routeInfoEl: HTMLElement,
    directionsBtn: HTMLButtonElement
  ): Promise<void> {
    if (this.isLoadingDirections || !this.currentPlaceCoordinate) return;

    this.isLoadingDirections = true;
    directionsBtn.disabled = true;
    directionsBtn.textContent = 'Getting directions...';

    try {
      // Get user's current location
      const userLocation = await this.getUserLocation();

      // Get directions
      const routeInfo = await this.getDirections(userLocation, this.currentPlaceCoordinate);

      // Show route on map
      this.showRoute(routeInfo.polylinePoints);
      this.hasActiveRoute = true;

      // Update UI
      routeInfoEl.innerHTML = `
        <span class="route-icon">🚗</span>
        <span>${this.formatDuration(routeInfo.duration)} · ${this.formatDistance(routeInfo.distance)}</span>
      `;
      routeInfoEl.style.display = 'flex';
      directionsBtn.textContent = 'Clear Route';
      directionsBtn.disabled = false;
    } catch (error) {
      console.warn('Failed to get directions:', error);
      directionsBtn.textContent = '🚗 Directions';
      directionsBtn.disabled = false;
    } finally {
      this.isLoadingDirections = false;
    }
  }

  private clearRouteAndUpdateUI(
    routeInfoEl: HTMLElement,
    directionsBtn: HTMLButtonElement
  ): void {
    this.clearRoute();
    this.hasActiveRoute = false;
    routeInfoEl.style.display = 'none';
    directionsBtn.textContent = '🚗 Directions';
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

  private hidePlaceDetail(): void {
    const wrapper = document.getElementById('place-detail-container');

    // Clear any active route
    if (this.hasActiveRoute) {
      this.clearRoute();
      this.hasActiveRoute = false;
    }

    // Clear the PlaceDetail
    this.currentPlaceDetail = null;
    this.currentPlaceCoordinate = null;

    if (wrapper) {
      wrapper.innerHTML = '';
      wrapper.style.display = 'none';
    }
    this.placeDetailContainer = null;
  }

  showRoute(points: LatLng[]): void {
    if (!this.map || points.length < 2) return;

    // Clear any existing route
    this.clearRoute();

    // Convert LatLng array to MapKit coordinates
    const coordinates = points.map(
      (p) => new mapkit.Coordinate(p.lat, p.lng)
    );

    // Create polyline overlay
    const style = new mapkit.Style({
      lineWidth: 5,
      strokeColor: '#007AFF',
      strokeOpacity: 0.8,
    });

    this.routeOverlay = new mapkit.PolylineOverlay(coordinates, { style });
    this.map.addOverlay(this.routeOverlay);
  }

  clearRoute(): void {
    if (!this.map || !this.routeOverlay) return;
    this.map.removeOverlay(this.routeOverlay);
    this.routeOverlay = null;
  }

  async getDirections(from: LatLng, to: LatLng): Promise<RouteInfo> {
    return new Promise((resolve, reject) => {
      const directions = new mapkit.Directions();

      const request = {
        origin: new mapkit.Coordinate(from.lat, from.lng),
        destination: new mapkit.Coordinate(to.lat, to.lng),
        transportType: mapkit.Directions.Transport.Automobile,
      };

      directions.route(request, (error: any, response: any) => {
        if (error || !response?.routes?.length) {
          reject(new Error(error?.message || 'Failed to get directions'));
          return;
        }

        const route = response.routes[0];

        // Extract polyline points from the route
        const polylinePoints: LatLng[] = [];
        if (route.polyline?.points) {
          for (const coord of route.polyline.points) {
            polylinePoints.push({
              lat: coord.latitude,
              lng: coord.longitude,
            });
          }
        }

        resolve({
          distance: route.distance, // meters
          duration: route.expectedTravelTime, // seconds
          polylinePoints,
        });
      });
    });
  }

  destroy(): void {
    this.hidePlaceDetail();
    this.clearRoute();
    if (this.map) {
      this.map.destroy();
      this.map = null;
    }
    this.container = null;
  }
}
