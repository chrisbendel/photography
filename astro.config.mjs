// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
// No `image` config: photographs come from R2 and are sized by Cloudflare Images
// (src/lib/images.ts), so `astro:assets` and sharp are unused.
export default defineConfig({
  site: 'https://photos.cbendel.me',
  adapter: cloudflare(),
});