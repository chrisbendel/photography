import { defineCollection, reference, z } from "astro:content";
import { photosLoader, seriesLoader } from "./loaders/d1";

// Entries come from D1 at build time (see src/loaders/d1.ts). The schema is
// unchanged from the markdown era apart from images: `image()` validated a file
// on disk, where `imageKey` points at an R2 object served through Cloudflare
// Images (see src/lib/images.ts). Drafts never reach the loader — it selects
// `published = 1` only.
const photos = defineCollection({
	loader: photosLoader(),
	schema: z.object({
		// When the entry was added to the site. Drives "newest" sorts.
		added: z.coerce.date(),
		// When the photograph was made (shutter clicked). Display only.
		date: z.coerce.date().optional(),
		imageKey: z.string(),
		// Intrinsic dimensions, captured at upload, to reserve layout space.
		width: z.number().optional(),
		height: z.number().optional(),
		alt: z.string(),
		caption: z.string().optional(),
		camera: z.string().optional(),
		film: z.string().optional(),
		location: z.string().optional(),
		format: z.string().optional(),
		series: reference("series").optional(),
		tags: z.array(z.string()).default([]),
	}),
});

const series = defineCollection({
	loader: seriesLoader(),
	schema: z.object({
		title: z.string(),
		description: z.string().optional(),
		// Optional — a series may exist without a chosen cover photo.
		cover: reference("photos").optional(),
		order: z.number().default(0),
	}),
});

export const collections = { photos, series };
