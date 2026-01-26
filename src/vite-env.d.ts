/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAPKIT_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
