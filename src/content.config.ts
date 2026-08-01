import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const photos = defineCollection({
	loader: glob({
		pattern: "**/*.md",
		base: "./src/content/photos",
		// Entries are <id>/index.md — strip the filename so the id is the folder.
		generateId: ({ entry }) =>
			entry.replace(/\/?index\.md$/, "").replace(/\.md$/, ""),
	}),
	schema: ({ image }) =>
		z.object({
			// Machine-stamped at scaffold; drives "newest" sorts.
			added: z.coerce.date(),
			// A year, not a date — no month to misremember, no timezone to get wrong.
			year: z.number().int().min(1800).nullish(),
			image: image(),
			alt: z.string(),
			caption: z.string().optional(),
			lens: z.string().optional(),
			film: z.string().optional(),
			location: z.string().optional(),
			format: z.string().optional(),
			// A slug, not a reference: naming one creates it (src/lib/series.ts).
			series: z.string().nullish(),
			tags: z.array(z.string()).default([]),
		}),
});

export const collections = { photos };
