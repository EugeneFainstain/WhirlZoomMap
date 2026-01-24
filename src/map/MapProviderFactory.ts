import { MapProvider, MapProviderType } from './types';
import { AppleMapProvider } from './providers/AppleMapProvider';

export function createMapProvider(type: MapProviderType): MapProvider {
  switch (type) {
    case 'apple':
      return new AppleMapProvider();
    default:
      throw new Error(`Unknown map provider type: ${type}`);
  }
}
