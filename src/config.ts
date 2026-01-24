export const config = {
  mapkit: {
    token: import.meta.env.VITE_MAPKIT_TOKEN as string,
  },
  defaults: {
    center: { lat: 37.7749, lng: -122.4194 }, // San Francisco
    zoom: 12,
    rotation: 0,
  },
};
