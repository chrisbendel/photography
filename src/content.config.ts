import { defineCollection, reference, z } from "astro:content";
import { glob } from "astro/loaders";

const photos = defineCollection({
	loader: glob({
		pattern: "**/*.md",
		base: "./src/content/photos",
		// Each photo lives in its own directory: src/content/photos/<id>/index.md
		// where <id> is a 6-char hex hash (e.g. "a3f4c1"). Strip the trailing
		// `/index.md` so the entry id is just the directory name.
		generateId: ({ entry }) =>
			entry.replace(/\/?index\.md$/, "").replace(/\.md$/, ""),
	}),
	schema: ({ image }) =>
		z.object({
			// When the entry was added to the site (machine-stamped by
			// `new-photo`). Drives "newest" sorts.
			added: z.coerce.date(),
			// When the photograph was made (shutter clicked). Display only.
			date: z.coerce.date().optional(),
			image: image(),
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
	loader: glob({ pattern: "**/*.md", base: "./src/content/series" }),
	schema: z.object({
		title: z.string(),
		description: z.string().optional(),
		// Optional — a series may exist without a chosen cover photo.
		cover: reference("photos").optional(),
		order: z.number().default(0),
	}),
});

export const collections = { photos, series };
