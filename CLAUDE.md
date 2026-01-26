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
Using a static domain-restricted token from the Apple Developer portal (no backend JWT generation needed). The token is set in `.env` and read at runtime.

## Adding a New Map Provider
1. Create `src/map/providers/YourProvider.ts` implementing `MapProvider`
2. Add the type to `MapProviderType` in `src/map/types.ts`
3. Add a case in `MapProviderFactory.ts`
4. Change the provider type in `src/main.ts`

## Working Preferences
- Minimize parallel tool calls to avoid API concurrency errors (400 due to tool use concurrency issues)
- Prefer sequential operations when there are dependencies between calls
