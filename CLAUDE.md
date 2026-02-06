# WhirlZoomMap

A custom mapping application built with TypeScript and Apple MapKit JS, featuring a transparent interaction layer that intercepts all user input before it reaches the map.

## Architecture

### Map Provider Abstraction (`src/map/`)
The map engine is abstracted behind a `MapProvider` interface, making it easy to swap Apple MapKit for Google Maps or another provider:

- **`types.ts`** — `MapProvider` interface with methods: `init`, `setCenter`, `getCenter`, `setZoom`, `getZoom`, `setRotation`, `getRotation`, `panBy`, `zoomAtPoint`, `getBounds`, `destroy`
- **`MapProviderFactory.ts`** — Factory function to instantiate providers by type
- **`providers/AppleMapProvider.ts`** — Apple MapKit JS implementation

### Interaction Layer (`src/interaction/`)
A transparent div sits on top of the map and captures all pointer/wheel events. The map itself has `pointer-events: none` — the interaction layer controls it programmatically via the `MapProvider` API.

- **`types.ts`** — `InteractionHandler` interface (`onPointerDown`, `onPointerMove`, `onPointerUp`, `onWheel`)
- **`InteractionLayer.ts`** — Creates the overlay div, captures events, delegates to the active handler
- **`handlers/PassThroughHandler.ts`** — Default handler that translates gestures into map API calls:
  - Single-pointer drag → `panBy(dx, dy)`
  - Mouse wheel → `zoomAtPoint(x, y, delta)`
  - Two-finger pinch → `zoomAtPoint(centerX, centerY, scale)`
  - Two-finger rotate → `setRotation(angle)`

### UI (`src/ui/`)
- **`MapControls.ts`** — Zoom +/- buttons, compass (shows rotation), location button
- **`SearchBar.ts`** — Search input with geocoding results dropdown

### Entry Point
- **`src/main.ts`** — Wires together the map provider, interaction layer, and UI components
- **`src/config.ts`** — Reads configuration from environment variables

### Configuration (`src/control.ts`)
Centralized constants file containing all tunable parameters. Organized by functional area:

| Section | Constants | Description |
|---------|-----------|-------------|
| **TOUCH_INTERACTION** | `DOUBLE_TAP_THRESHOLD_MS` | Timing for double-tap detection |
| **ROTATION** | `ROTATION_MODE`, `ROTATION_SPEED_DEG_PER_FRAME` | Rotation behavior and speed |
| **EDGE_INDICATOR** | `EDGE_BAR_*`, `EDGE_*_THRESHOLD_RATIO` | Edge bar styling and trigger zones |
| **GEAR_INDICATOR** | `GEAR_*`, `ROTATION_EDGE_THRESHOLD_RATIO` | Gear icon styling, position, and map sync |
| **INERTIA** | `INERTIA_FRICTION`, `INERTIA_MIN_VELOCITY`, etc. | Pan momentum physics |
| **ZOOM** | `ZOOM_*` | Zoom thresholds and limits |
| **VISUALIZATION** | `TRAIL_*`, `SPIRAL_*`, `ZOOM_AREA_*` | Trail and area circle rendering |
| **MAP_DEFAULTS** | `MAP_DEFAULT_CENTER`, `MAP_DEFAULT_ZOOM`, etc. | Initial map state |
| **GEOLOCATION** | `GEOLOCATION_*` | GPS timeout and update frequency |
| **ROUTES** | `ROUTE_*` | Polyline styling |
| **POI** | `POI_*` | Point of interest detection |
| **UI** | `SEARCH_*`, `DEBUG_*`, `LOCATION_BUTTON_ZOOM` | Search and UI behavior |

Screen-dimension-dependent values are expressed as ratios (e.g., `ROTATION_EDGE_THRESHOLD_RATIO = 10` means `rect.width / 10`).

**Important:** `control.ts` has no imports from other project files to avoid circular dependencies.

## Tech Stack
- **TypeScript** (vanilla, no framework)
- **Vite** (dev server + bundler)
- **Apple MapKit JS** (loaded via CDN)

## Setup

1. `npm install`
2. Create `.env` with your MapKit JS token:
   ```
   VITE_MAPKIT_TOKEN=your_jwt_token_here
   ```
3. `npm run dev` — starts dev server on port 5173

### Accessing from Android device
```
adb reverse tcp:5173 tcp:5173
```
Then open `http://127.0.0.1:5173/WhirlZoomMap/` on the device.

## MapKit JS Token

The token is a JWT signed with your Apple Developer private key. It's stored in `.env` and read at runtime.

### Updating the Token

When your token expires (or you need a new key), run:

```bash
node update-mapkit-key.cjs
```

This interactive script will:
1. Guide you through getting a new key from the Apple Developer portal
2. Prompt for your private key and Key ID
3. Generate a new JWT (valid for 180 days)
4. Optionally update `.env` automatically

**Requires:** `npm install jsonwebtoken` (already in devDependencies)

## Adding a New Map Provider
1. Create `src/map/providers/YourProvider.ts` implementing `MapProvider`
2. Add the type to `MapProviderType` in `src/map/types.ts`
3. Add a case in `MapProviderFactory.ts`
4. Change the provider type in `src/main.ts`

## POI Selection UX

POI (Point of Interest) interaction uses a two-tap pattern for better mobile UX:

1. **First tap** on POI → enlarges/selects it (MapKit default behavior)
2. **Second tap** on enlarged POI → shows the PlaceDetail card with loading state

This avoids accidental card popups when users just want to see the POI name. The hit detection for the second tap accounts for the POI icon being visually displayed ~35px above its coordinate point (pin tip vs icon center).

### Loading State
The PlaceDetail card shows a loading placeholder immediately on tap, then overlays the real content when MapKit's `PlaceLookup` completes. The loading placeholder stays as a background layer to prevent visual flicker.

## Mobile Touch Handling

### Double-tap-to-zoom Prevention
Browser double-tap-to-zoom is disabled via:
- CSS `touch-action: manipulation` on all elements (catches most cases)
- JavaScript `touchend` listener that calls `preventDefault()` on rapid successive touches (catches shadow DOM elements like MapKit's PlaceDetail that bypass CSS)

This is necessary because MapKit creates shadow DOM elements that don't inherit the parent's `touch-action` CSS property.

## Apple Developer Documentation

Apple's developer documentation requires JavaScript to render, making it inaccessible to web fetch tools. Use **sosumi.ai** as a proxy to get AI-readable documentation:

**Original URL:**
```
https://developer.apple.com/documentation/mapkitjs/mapkit.placedetail
```

**AI-readable URL:**
```
https://sosumi.ai/documentation/mapkitjs/mapkit.placedetail
```

Simply replace `developer.apple.com` with `sosumi.ai` in the URL path.
