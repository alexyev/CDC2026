/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to any value to load data from src/test/fixtures/ instead of /data/v1/. */
  readonly VITE_USE_FIXTURES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
