/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public Neon Auth endpoint. Supplies the automatic anonymous token. */
  readonly VITE_NEON_AUTH_URL: string
  /** Public Neon Data API endpoint. */
  readonly VITE_NEON_DATA_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
