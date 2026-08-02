// @ts-check
import { defineConfig, sessionDrivers } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://photos.cbendel.me',
  // Without this the adapter binds a SESSION KV namespace nothing here uses.
  session: { driver: sessionDrivers.null() },

  // /gallery/ was the mosaic before it became the homepage.
  redirects: { "/gallery": "/" },

  // Static images via sharp at build; the default /_image endpoint 404s here.
  adapter: cloudflare({ imageService: 'compile' }),
});