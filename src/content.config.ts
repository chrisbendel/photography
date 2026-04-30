import { defineCollection, reference, z } from "astro:content";
import { glob } from "astro/loaders";

const photos = defineCollection({
	loader: glob({
		pattern: "**/*.md",
		base: "./src/content/photos",
		// Each photo lives in its own directory: src/content/photos/<slug>/index.md
		// Strip the trailing `/index.md` so the entry id is just the slug.
		generateId: ({ entry }) =>
			entry.replace(/\/?index\.md$/, "").replace(/\.md$/, ""),
	}),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			date: z.coerce.date(),
			image: image(),
			alt: z.string(),
			caption: z.string().optional(),
			camera: z.string().optional(),
			film: z.string().optional(),
			location: z.string().optional(),
			format: z.string().optional(),
			series: reference("series").optional(),
			tags: z.array(z.string()).default([]),
			draft: z.boolean().default(false),
		}),
});

const series = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/series" }),
	schema: z.object({
		title: z.string(),
		description: z.string().optional(),
		cover: reference("photos"),
		order: z.number().default(0),
		draft: z.boolean().default(false),
	}),
});

export const collections = { photos, series };
