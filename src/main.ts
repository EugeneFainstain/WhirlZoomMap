import { config } from './config';
import { createMapProvider } from './map/MapProviderFactory';
import { InteractionLayer } from './interaction/InteractionLayer';
import { PassThroughHandler } from './interaction/handlers/PassThroughHandler';
import { MapControls } from './ui/MapControls';
import { SearchBar } from './ui/SearchBar';

async function main() {
  const mapContainer = document.getElementById('map-container')!;
  const interactionElement = document.getElementById('interaction-layer')!;
  const controlsContainer = document.getElementById('map-controls-container')!;
  const searchContainer = document.getElementById('search-bar-container')!;

  // Create and initialize the map provider
  const mapProvider = createMapProvider('apple');

  await mapProvider.init(mapContainer, {
    center: config.defaults.center,
    zoom: config.defaults.zoom,
    rotation: config.defaults.rotation,
  });

  // Set up the interaction layer with pass-through handler
  const handler = new PassThroughHandler();
  const interactionLayer = new InteractionLayer(interactionElement, handler, mapProvider);

  // Set up UI
  const mapControls = new MapControls(controlsContainer, mapProvider);
  const searchBar = new SearchBar(searchContainer, mapProvider);

  // Expose for debugging in dev
  if (import.meta.env.DEV) {
    (window as any).__whirlZoomMap = {
      mapProvider,
      interactionLayer,
      mapControls,
      searchBar,
    };
  }
}

main().catch((err) => {
  console.error('Failed to initialize WhirlZoomMap:', err);
});
