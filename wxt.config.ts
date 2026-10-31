// wxt.config.ts
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  webExt: {
    disabled: true,
  },
  manifest: ({ browser }) => {
    const isChromium = browser !== 'firefox';

    const permissions = ['storage', 'unlimitedStorage', 'tabs'];
    if (isChromium) {
      permissions.push('offscreen');
    }

    const baseManifest: any = {
      name: '2Subs2Learn',
      version: '0.0.5',
      permissions,
      host_permissions: [
        'https://www.youtube.com/*',
        'https://*.zdf.de/*',
        '*://*.youtube.com/*',
        '*://www.zdf.de/*',
      ],
      content_security_policy: {
        extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
      }
    };

    // Apply strict Mozilla Add-on (AMO) store requirements for Firefox builds
    if (!isChromium) {
      baseManifest.browser_specific_settings = {
        gecko: {
          id: '2subs2learn@theonlyalfaz.com',
          data_collection_permissions: {
            required: ['none']
          }
        }
      };
    }

    return baseManifest;
  },
  zip: {
    artifactTemplate: '2Subs2Learn-{{version}}-{{browser}}.zip',
  },
  vite: () => ({
    plugins: [tailwindcss()],
    build: {
      rollupOptions: {
        onwarn(warning, warn) {
          // Safely suppress third-party eval warnings from onnxruntime-web
          if (warning.code === 'EVAL') return;
          warn(warning);
        }
      }
    }
  }),
});