import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  webExt: {
    disabled: true,
  },
  manifest: {
    permissions: ['storage'],
    host_permissions: [
    "https://www.youtube.com/*",
    "https://*.zdf.de/*",
    "http://localhost:3000/*"
  ]
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});