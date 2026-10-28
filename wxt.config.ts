// wxt.config.ts
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
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

    return {
      name: '2Subs2Learn',
      version: '0.0.5',
      permissions,
      host_permissions: [
        'https://www.youtube.com/*',
        'https://*.zdf.de/*',
        'http://localhost:3000/*',
        'https://translate.theonlyalfaz.com/*',
        '*://*.youtube.com/*',
        '*://www.zdf.de/*',
        'http://localhost/*'
      ],
      content_security_policy: {
        extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
      }
    };
  },
  zip: {
    artifactTemplate: '2Subs2Learn-{{version}}-{{browser}}.zip',
  },
  vite: () => ({
    plugins: [tailwindcss()],
    build: {
      rollupOptions: {
        onwarn(warning, warn) {
          // Suppress third-party eval warnings from onnxruntime-web to clean up the console
          if (warning.code === 'EVAL') return;
          warn(warning);
        }
      }
    }
  }),
});