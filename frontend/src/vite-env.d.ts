/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin for API calls (no trailing slash), e.g. http://127.0.0.1:8001 */
  readonly AI_BASE_URL?: string
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
