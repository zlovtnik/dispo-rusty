/// <reference types="vite/client" />

/**
 * Type definitions for Vite environment variables
 * All custom environment variables must be prefixed with VITE_
 */

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_JWT_STORAGE_KEY?: string;
  readonly VITE_DEBUG?: string;
  readonly MODE: 'development' | 'production' | 'test';
  readonly PROD: boolean;
  readonly DEV: boolean;
  readonly SSR: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
