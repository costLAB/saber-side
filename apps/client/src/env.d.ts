interface ImportMetaEnv {
  /** The real station, set in render.yaml for builds of the game. Unset means single-player. */
  readonly VITE_SERVER_URL?: string;
  /** The staging station, which PR previews of the game join instead (see net/server-url.ts). */
  readonly VITE_PREVIEW_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
