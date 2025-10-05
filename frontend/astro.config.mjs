// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  devToolbar: {
    enabled: true
  },
  vite: {
    plugins: [],
    build: {
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: [
            'console.log',
            'console.info',
            'console.debug',
            'console.warn',
            'console.error',
            'console.trace'
          ],
          passes: 5,
          unsafe: true,
          unsafe_arrows: true,
          unsafe_comps: true,
          unsafe_Function: true,
          unsafe_math: true,
          unsafe_symbols: true,
          unsafe_methods: true,
          unsafe_proto: true,
          unsafe_regexp: true,
          unsafe_undefined: true
        },
        mangle: {
          toplevel: true,
          safari10: true,
          properties: {
            regex: /^_[a-zA-Z]/, // Mangle private properties
            keep_quoted: true
          }
        },
        format: {
          comments: false
        }
      },
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['astro']
          },
          chunkFileNames: 'chunk-[hash].js',
          entryFileNames: 'entry-[hash].js',
          assetFileNames: 'asset-[hash].[ext]'
        }
      },
      sourcemap: false,
      chunkSizeWarningLimit: 2000
    },
    define: {
      __DEV__: false,
      'process.env.NODE_ENV': '"production"',
      'process.env.DEBUG': 'false',
      global: 'globalThis'
    }
  }
});
