/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_YANDEX_MAPS_API_KEY: string;
}

/** Номер сборки, подставляется Vite (см. vite.config.ts). */
declare const __APP_VERSION__: string;
