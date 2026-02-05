import {
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  MAP_DEFAULT_ROTATION,
} from './control';

export const config = {
  mapkit: {
    token: import.meta.env.VITE_MAPKIT_TOKEN as string,
  },
  defaults: {
    center: MAP_DEFAULT_CENTER,
    zoom: MAP_DEFAULT_ZOOM,
    rotation: MAP_DEFAULT_ROTATION,
  },
};
