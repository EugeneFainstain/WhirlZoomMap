import { config } from './config';
import { createMapProvider } from './map/MapProviderFactory';
import { InteractionLayer } from './interaction/InteractionLayer';
import { PassThroughHandler } from './interaction/handlers/PassThroughHandler';
import { MapControls } from './ui/MapControls';
import { SearchBar } from './ui/SearchBar';
import { TrailVisualizer } from './visualization/TrailVisualizer';

async function main() {
  const mapContainer = document.getElementById('map-container')!;
  const interactionElement = document.getElementById('interaction-layer')!;
  const controlsContainer = document.getElementById('map-controls-container')!;
  const searchContainer = document.getElementById('search-bar-container')!;
  const visualizationCanvas = document.getElementById('visualization-canvas') as HTMLCanvasElement;

  // Create and initialize the map provider
  const mapProvider = createMapProvider('apple');

  await mapProvider.init(mapContainer, {
    center: config.defaults.center,
    zoom: config.defaults.zoom,
    rotation: config.defaults.rotation,
  });

  // Set up visualization
  const trailVisualizer = new TrailVisualizer(visualizationCanvas);

  // Set up the interaction layer with pass-through handler
  const handler = new PassThroughHandler();
  handler.setVisualizer(trailVisualizer);
  handler.setAlt1Mode(true); // Alt1 mode enabled by default
  const interactionLayer = new InteractionLayer(interactionElement, handler, mapProvider);

  // Set up UI
  const mapControls = new MapControls(controlsContainer, mapProvider);
  const searchBar = new SearchBar(searchContainer, mapProvider);

  // Native mode toggle
  const nativeCheckbox = document.getElementById('native-toggle-checkbox') as HTMLInputElement;
  nativeCheckbox.addEventListener('change', () => {
    const useNative = nativeCheckbox.checked;
    // Toggle native map interactions and disable custom gesture handling
    mapProvider.setNativeInteractionsEnabled(useNative);
    interactionLayer.setEnabled(!useNative);
  });

  // Visualize toggle
  const visualizeCheckbox = document.getElementById('visualize-toggle-checkbox') as HTMLInputElement;
  visualizeCheckbox.addEventListener('change', () => {
    const visualize = visualizeCheckbox.checked;
    trailVisualizer.setEnabled(visualize);
  });

  // Alt1 toggle - use compound zoom value
  const alt1Checkbox = document.getElementById('alt1-toggle-checkbox') as HTMLInputElement;
  alt1Checkbox.addEventListener('change', () => {
    handler.setAlt1Mode(alt1Checkbox.checked);
  });

  // Expose for debugging in dev
  if (import.meta.env.DEV) {
    (window as any).__whirlZoomMap = {
      mapProvider,
      interactionLayer,
      mapControls,
      searchBar,
      trailVisualizer,
    };
  }
}

main().catch((err) => {
  console.error('Failed to initialize WhirlZoomMap:', err);
});
