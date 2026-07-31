declare namespace App {
	interface Locals {
		/** Set by middleware from the Cloudflare Access header. */
		studioUser?: string;
	}
}

interface ImportMetaEnv {
	/** R2 custom domain serving photo objects, e.g. https://img.photos.cbendel.me */
	readonly PUBLIC_IMAGE_BASE: string;
	/** "0" disables Cloudflare Images transformations and serves originals. */
	readonly PUBLIC_IMAGE_TRANSFORM?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
