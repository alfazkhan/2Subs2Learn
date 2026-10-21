// wxt.config.ts
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  webExt: {
    disabled: true,
  },
  // outDir: 'releases',
  manifest: {
    name: '2Subs2Learn',
    version: '0.0.5',
    permissions: ['storage', 'unlimitedStorage'],
    host_permissions: [
      "https://www.youtube.com/*",
      "https://*.zdf.de/*",
      "http://localhost:3000/*",
      "https://translate.theonlyalfaz.com/*"
    ]
  },
  zip: {
    artifactTemplate: '2Subs2Learn-{{version}}-{{browser}}.zip',
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});