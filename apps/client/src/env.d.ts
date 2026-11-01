interface ImportMetaEnv {
  /** The station server for this build, set per Netlify deploy context in netlify.toml. Unset means single-player. */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
