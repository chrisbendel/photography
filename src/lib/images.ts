// Image URLs for photos stored in R2.
//
// sharp can't run on Workers, so there's no build-time or runtime resizing here.
// Instead R2 objects are served through Cloudflare Images transformations, which
// resize and pick a format per request from the `Accept` header, then cache at
// the edge. Keys are content-addressed, so every URL is safe to cache forever.
//
// PUBLIC_IMAGE_BASE — R2 custom domain, e.g. https://img.photos.cbendel.me
// PUBLIC_IMAGE_TRANSFORM — "0" to bypass transformations and serve originals.
// Bypassing is the escape hatch if Images isn't enabled on the zone: pages still
// work, they just download full-size files.

const BASE = (import.meta.env.PUBLIC_IMAGE_BASE ?? "").replace(/\/$/, "");
const TRANSFORM = import.meta.env.PUBLIC_IMAGE_TRANSFORM !== "0";

// A base without a scheme yields relative URLs — images silently break on every
// page except the root, and the RSS feed emits unusable links. Fail loudly.
if (BASE && !/^https?:\/\//.test(BASE)) {
	throw new Error(
		`PUBLIC_IMAGE_BASE must include a scheme, e.g. https://${BASE} — got "${BASE}".`,
	);
}

export const DEFAULT_WIDTHS = [400, 800, 1200, 1600];
const QUALITY = 85;

/** Original object, no transformation. */
export function photoOriginal(key: string): string {
	return `${BASE}/${key}`;
}

/** One transformed variant at a given width. */
export function photoSrc(key: string, width: number): string {
	if (!TRANSFORM) return photoOriginal(key);
	return `${BASE}/cdn-cgi/image/width=${width},quality=${QUALITY},format=auto/${key}`;
}

/**
 * `srcset` covering the given widths, for use with a `sizes` attribute.
 * Undefined when transformations are off, so the attribute is omitted entirely
 * rather than rendered empty.
 */
export function photoSrcset(
	key: string,
	widths: number[] = DEFAULT_WIDTHS,
): string | undefined {
	if (!TRANSFORM) return undefined;
	return widths.map((w) => `${photoSrc(key, w)} ${w}w`).join(", ");
}

/**
 * Everything an `<img>` needs. `width`/`height` are the intrinsic dimensions
 * recorded at upload — passing them through prevents layout shift, which the
 * old `<Image>` component handled automatically.
 */
export function photoImg(
	photo: { imageKey: string; width?: number; height?: number },
	{ widths = DEFAULT_WIDTHS, sizes }: { widths?: number[]; sizes?: string } = {},
) {
	const fallbackWidth = widths[widths.length - 1];
	return {
		src: photoSrc(photo.imageKey, fallbackWidth),
		srcset: photoSrcset(photo.imageKey, widths),
		sizes,
		width: photo.width,
		height: photo.height,
	};
}
