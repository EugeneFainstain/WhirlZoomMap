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
  private selectedMarker: { marker: MapMarker; annotation: any; selectedAt: number } | null = null;
  private routeOverlay: any = null;
  private isLoadingDirections = false;
  private hasActiveRoute = false;
  private cachedUserLocation: LatLng | null = null;
  private locationWatchId: number | null = null;

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
        // Show user location with blue dot and heading indicator
        showsUserLocation: true,
        tracksUserCourse: true,
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

      // Also listen for clicks on the container to detect taps on already-selected POI or marker
      container.addEventListener('click', (e: MouseEvent) => {
        if (this.currentPlaceDetail) return;

        // Check for selected POI
        if (this.selectedPOI) {
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
        }

        // Check for selected marker (with or without placeId) - single tap opens card
        if (this.selectedMarker) {
          const annCoord = this.selectedMarker.annotation.coordinate;
          const annPoint = this.map.convertCoordinateToPointOnPage(annCoord);
          const iconCenterY = annPoint.y - 35;

          const dx = e.pageX - annPoint.x;
          const dy = e.pageY - iconCenterY;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 45) {
            const marker = this.selectedMarker.marker;
            if (marker.placeId) {
              this.showPlaceDetail(marker.placeId, marker);
            } else {
              this.showSimpleAddressCard(marker);
            }
          }
        }
      });

      // Listen for deselect to hide the place detail
      this.map.addEventListener('deselect', () => {
        this.selectedPOI = null;
        this.selectedMarker = null;
        this.hidePlaceDetail();
      });

      resolve();
    });

    // Start watching user location (wait for initial position)
    await this.startLocationTracking();
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

  setCenterAndZoom(lat: number, lng: number, zoom: number, animated = true): void {
    if (!this.map) return;
    const span = 360 / Math.pow(2, zoom);
    const region = new mapkit.CoordinateRegion(
      new mapkit.Coordinate(lat, lng),
      new mapkit.CoordinateSpan(span, span)
    );
    this.map.setRegionAnimated(region, animated);
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
      if (marker) {
        // Two-tap pattern for all markers (like POIs)
        if (this.selectedMarker?.marker.id === marker.id) {
          if (marker.placeId) {
            this.showPlaceDetail(marker.placeId, marker);
          } else {
            this.showSimpleAddressCard(marker);
          }
        } else {
          this.selectedMarker = { marker, annotation, selectedAt: Date.now() };
        }
        if (this.markerSelectCallback) {
          this.markerSelectCallback(marker);
        }
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

  private showPlaceDetail(placeId: string, fallbackMarker?: MapMarker): void {
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
        // If we have fallback marker data, show a simple address card instead
        if (fallbackMarker) {
          this.showSimpleAddressCard(fallbackMarker);
        } else {
          this.hidePlaceDetail();
        }
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

      // Add route info container (hidden initially)
      const routeInfoEl = document.createElement('div');
      routeInfoEl.className = 'place-detail-route';
      routeInfoEl.style.display = 'none';
      mainContainer.appendChild(routeInfoEl);

      // Add custom directions button row with 3 transport options (car, bike, walk order)
      const actionsRow = document.createElement('div');
      actionsRow.className = 'place-detail-actions';
      actionsRow.innerHTML = `
        <button class="direction-type-btn" data-transport="Automobile">
          <svg class="transport-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
          </svg>
          <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>
        <button class="direction-type-btn" data-transport="Cycling">
          <svg class="transport-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM5 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5zm5.8-10l2.4 2.4-2.4 2.4V19h2v-3.1l2.1-2.1 2.6 5.2h2.2l-3.5-7 1.6-1.6c.6.6 1.4 1.1 2.3 1.3l.4-2c-.6-.1-1.1-.4-1.5-.8l-1.6-1.6c-.4-.4-.9-.6-1.4-.6s-1 .2-1.3.5L10.2 11H7v2h4.3l-.5-.5zM19 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5z"/>
          </svg>
          <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>
        <button class="direction-type-btn" data-transport="Walking">
          <svg class="transport-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/>
          </svg>
          <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>
        <button class="close-btn">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      `;
      mainContainer.appendChild(actionsRow);

      // Bind button events
      const directionBtns = actionsRow.querySelectorAll('.direction-type-btn');
      const closeBtn = actionsRow.querySelector('.close-btn') as HTMLButtonElement;

      directionBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const transport = (btn as HTMLElement).dataset.transport || 'Automobile';
          this.requestDirectionsWithTransport(transport, routeInfoEl, directionBtns, btn as HTMLButtonElement);
        });
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

    // Note: Route is intentionally NOT cleared here - it should remain visible
    // until a different route is built

    // Clear the PlaceDetail
    this.currentPlaceDetail = null;
    this.currentPlaceCoordinate = null;

    if (wrapper) {
      wrapper.innerHTML = '';
      wrapper.style.display = 'none';
    }
    this.placeDetailContainer = null;
  }

  private showSimpleAddressCard(marker: MapMarker): void {
    const wrapper = document.getElementById('place-detail-container');
    if (!wrapper) return;

    // Store coordinate for directions
    this.currentPlaceCoordinate = {
      lat: marker.lat,
      lng: marker.lng,
    };

    // Show wrapper and clear content
    wrapper.style.display = 'block';
    wrapper.innerHTML = '';

    // Create main container
    const mainContainer = document.createElement('div');
    mainContainer.className = 'place-detail-hybrid';
    wrapper.appendChild(mainContainer);

    // Create simple address display (instead of MapKit PlaceDetail)
    const addressEl = document.createElement('div');
    addressEl.className = 'simple-address-card';
    addressEl.innerHTML = `
      <div class="address-title">${marker.title}</div>
      ${marker.subtitle ? `<div class="address-subtitle">${marker.subtitle}</div>` : ''}
    `;
    mainContainer.appendChild(addressEl);

    // Add route info container (hidden initially)
    const routeInfoEl = document.createElement('div');
    routeInfoEl.className = 'place-detail-route';
    routeInfoEl.style.display = 'none';
    mainContainer.appendChild(routeInfoEl);

    // Add custom directions button row (same as full PlaceDetail)
    const actionsRow = document.createElement('div');
    actionsRow.className = 'place-detail-actions';
    actionsRow.innerHTML = `
      <button class="direction-type-btn" data-transport="Automobile">
        <svg class="transport-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
        </svg>
        <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </button>
      <button class="direction-type-btn" data-transport="Cycling">
        <svg class="transport-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM5 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5zm5.8-10l2.4 2.4-2.4 2.4V19h2v-3.1l2.1-2.1 2.6 5.2h2.2l-3.5-7 1.6-1.6c.6.6 1.4 1.1 2.3 1.3l.4-2c-.6-.1-1.1-.4-1.5-.8l-1.6-1.6c-.4-.4-.9-.6-1.4-.6s-1 .2-1.3.5L10.2 11H7v2h4.3l-.5-.5zM19 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5z"/>
        </svg>
        <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </button>
      <button class="direction-type-btn" data-transport="Walking">
        <svg class="transport-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/>
        </svg>
        <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </button>
      <button class="close-btn">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
    `;
    mainContainer.appendChild(actionsRow);

    // Bind button events
    const directionBtns = actionsRow.querySelectorAll('.direction-type-btn');
    const closeBtn = actionsRow.querySelector('.close-btn') as HTMLButtonElement;

    directionBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const transport = (btn as HTMLElement).dataset.transport || 'Automobile';
        this.requestDirectionsWithTransport(transport, routeInfoEl, directionBtns, btn as HTMLButtonElement);
      });
    });

    closeBtn.addEventListener('click', () => {
      this.hidePlaceDetail();
    });

    this.placeDetailContainer = mainContainer;
  }

  private async requestDirectionsWithTransport(
    transport: string,
    routeInfoEl: HTMLElement,
    allBtns: NodeListOf<Element>,
    activeBtn: HTMLButtonElement
  ): Promise<void> {
    if (this.isLoadingDirections || !this.currentPlaceCoordinate) return;

    // Use cached location - no waiting
    if (!this.cachedUserLocation) {
      console.warn('No cached user location available for directions');
      return;
    }

    this.isLoadingDirections = true;

    // Disable all direction buttons while loading
    allBtns.forEach((btn) => (btn as HTMLButtonElement).disabled = true);

    try {
      const routeInfo = await this.getDirectionsWithTransport(this.cachedUserLocation, this.currentPlaceCoordinate, transport);

      // Show route on map with transport-specific styling
      this.showRoute(routeInfo.polylinePoints, transport);
      this.hasActiveRoute = true;

      // Mark the active button as selected (show checkmark)
      allBtns.forEach((btn) => btn.classList.remove('selected'));
      activeBtn.classList.add('selected');

      // Update route info display
      routeInfoEl.innerHTML = `
        <span>${this.formatDuration(routeInfo.duration)} · ${this.formatDistance(routeInfo.distance)}</span>
      `;
      routeInfoEl.style.display = 'flex';
    } catch (error) {
      console.warn('Failed to get directions:', error);
    } finally {
      this.isLoadingDirections = false;
      allBtns.forEach((btn) => (btn as HTMLButtonElement).disabled = false);
    }
  }

  private async getDirectionsWithTransport(from: LatLng, to: LatLng, transport: string): Promise<RouteInfo> {
    return new Promise((resolve, reject) => {
      const directions = new mapkit.Directions();

      // Map transport string to MapKit transport type
      let transportType = mapkit.Directions.Transport.Automobile;
      if (transport === 'Walking') {
        transportType = mapkit.Directions.Transport.Walking;
      } else if (transport === 'Cycling') {
        transportType = mapkit.Directions.Transport.Cycling;
      }

      const request = {
        origin: new mapkit.Coordinate(from.lat, from.lng),
        destination: new mapkit.Coordinate(to.lat, to.lng),
        transportType,
      };

      directions.route(request, (error: any, response: any) => {
        if (error || !response?.routes?.length) {
          reject(new Error(error?.message || 'Failed to get directions'));
          return;
        }

        const route = response.routes[0];
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
          distance: route.distance,
          duration: route.expectedTravelTime,
          polylinePoints,
        });
      });
    });
  }

  showRoute(points: LatLng[], transport: string = 'Automobile'): void {
    if (!this.map || points.length < 2) return;

    // Clear any existing route
    this.clearRoute();

    // Convert LatLng array to MapKit coordinates
    const coordinates = points.map(
      (p) => new mapkit.Coordinate(p.lat, p.lng)
    );

    // Create style based on transport type
    const styleOptions: any = {
      lineWidth: 6,
      strokeColor: '#007AFF',
      strokeOpacity: 0.9,
    };

    if (transport === 'Walking') {
      // Dotted line (small circles) for walking
      styleOptions.lineDash = [1, 15];
      styleOptions.lineCap = 'round';
    } else if (transport === 'Cycling') {
      // Dashed line for cycling
      styleOptions.lineDash = [8, 12];
      styleOptions.lineCap = 'round';
    }
    // Automobile uses solid line (no lineDash)

    const style = new mapkit.Style(styleOptions);

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

  private async startLocationTracking(): Promise<void> {
    if (!navigator.geolocation) return;

    // Get fast network-based position first (low accuracy but instant)
    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.cachedUserLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          resolve();
        },
        () => resolve(), // Resolve anyway on error, don't block
        { enableHighAccuracy: false, maximumAge: Infinity, timeout: 3000 }
      );
    });

    // Watch for position updates (will refine with GPS over time)
    this.locationWatchId = navigator.geolocation.watchPosition(
      (position) => {
        this.cachedUserLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
      },
      () => {}, // Ignore errors for background tracking
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
  }

  private stopLocationTracking(): void {
    if (this.locationWatchId !== null) {
      navigator.geolocation.clearWatch(this.locationWatchId);
      this.locationWatchId = null;
    }
  }

  async centerOnUserLocation(zoom?: number): Promise<void> {
    if (!this.map) return;

    // Use cached location if available for instant response
    if (this.cachedUserLocation) {
      const coord = new mapkit.Coordinate(
        this.cachedUserLocation.lat,
        this.cachedUserLocation.lng
      );
      const zoomLevel = zoom ?? this.getZoom();
      const span = 360 / Math.pow(2, zoomLevel);
      const region = new mapkit.CoordinateRegion(
        coord,
        new mapkit.CoordinateSpan(span, span)
      );
      this.map.setRegionAnimated(region, true);
      return;
    }

    // Fallback to fresh query if no cached location
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!this.map) {
            resolve();
            return;
          }
          this.cachedUserLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          const coord = new mapkit.Coordinate(
            position.coords.latitude,
            position.coords.longitude
          );
          const zoomLevel = zoom ?? this.getZoom();
          const span = 360 / Math.pow(2, zoomLevel);
          const region = new mapkit.CoordinateRegion(
            coord,
            new mapkit.CoordinateSpan(span, span)
          );
          this.map.setRegionAnimated(region, true);
          resolve();
        },
        (error) => {
          console.warn('Geolocation error:', error.message);
          reject(error);
        },
        { enableHighAccuracy: false, maximumAge: 0, timeout: 5000 }
      );
    });
  }

  destroy(): void {
    this.stopLocationTracking();
    this.hidePlaceDetail();
    this.clearRoute();
    if (this.map) {
      this.map.destroy();
      this.map = null;
    }
    this.container = null;
  }
}
