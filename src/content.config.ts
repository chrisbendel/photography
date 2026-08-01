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
			// When the shutter clicked — a year, not a date. Film rarely remembers
			// more than that, and a plain number has no timezone to get wrong.
			// Nullish because the scaffold writes it blank.
			year: z.number().int().min(1800).nullish(),
			image: image(),
			alt: z.string(),
			caption: z.string().optional(),
			lens: z.string().optional(),
			film: z.string().optional(),
			location: z.string().optional(),
			format: z.string().optional(),
			// Naming a series here is what creates it — there are no series files
			// and nothing to dangle (see src/lib/series.ts). Nullish because the
			// scaffold writes it blank.
			series: z.string().nullish(),
			tags: z.array(z.string()).default([]),
		}),
});

export const collections = { photos };
