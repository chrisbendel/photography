// Content collection loaders backed by D1.
//
// These run at build time, so every public page stays prerendered with zero
// client JS — the same output as when entries were markdown files. Only the
// source of the data changed, which is why the page templates barely differ.
//
// Without D1 credentials the collections load empty rather than failing, so a
// fresh clone can still build (you get the "no photographs yet" states).

import type { Loader } from "astro/loaders";
import { d1Query, hasD1Credentials } from "../lib/d1.mjs";

/** Rows are stringly-typed coming out of D1; "" and NULL both mean absent. */
function optional(value: unknown): string | undefined {
	if (value == null) return undefined;
	const s = String(value).trim();
	return s === "" ? undefined : s;
}

export function photosLoader(): Loader {
	return {
		name: "d1-photos",
		async load({ store, parseData, generateDigest, renderMarkdown, logger }) {
			store.clear();

			if (!hasD1Credentials()) {
				logger.warn("No D1 credentials — photos collection will be empty.");
				return;
			}

			const rows = await d1Query(
				`SELECT id, added, date, alt, caption, camera, film, location, format,
				        series, notes, image_key, width, height
				 FROM photos WHERE published = 1 ORDER BY added DESC`,
			);
			const tagRows = await d1Query(`SELECT photo_id, tag FROM photo_tags ORDER BY tag`);

			const tagsByPhoto = new Map<string, string[]>();
			for (const { photo_id, tag } of tagRows) {
				const list = tagsByPhoto.get(photo_id) ?? [];
				list.push(tag);
				tagsByPhoto.set(photo_id, list);
			}

			for (const row of rows) {
				const notes = optional(row.notes) ?? "";
				const data = await parseData({
					id: row.id,
					data: {
						added: row.added,
						date: optional(row.date),
						alt: row.alt,
						caption: optional(row.caption),
						camera: optional(row.camera),
						film: optional(row.film),
						location: optional(row.location),
						format: optional(row.format),
						series: optional(row.series),
						imageKey: row.image_key,
						width: row.width ?? undefined,
						height: row.height ?? undefined,
						tags: tagsByPhoto.get(row.id) ?? [],
					},
				});

				store.set({
					id: row.id,
					data,
					body: notes,
					digest: generateDigest({ ...row, tags: tagsByPhoto.get(row.id) }),
					rendered: notes.trim() ? await renderMarkdown(notes) : undefined,
				});
			}

			logger.info(`Loaded ${rows.length} published photo(s) from D1.`);
		},
	};
}

export function seriesLoader(): Loader {
	return {
		name: "d1-series",
		async load({ store, parseData, generateDigest, logger }) {
			store.clear();

			if (!hasD1Credentials()) {
				logger.warn("No D1 credentials — series collection will be empty.");
				return;
			}

			const rows = await d1Query(
				`SELECT slug, title, description, cover, sort_order FROM series ORDER BY sort_order, title`,
			);

			for (const row of rows) {
				const data = await parseData({
					id: row.slug,
					data: {
						title: row.title,
						description: optional(row.description),
						cover: optional(row.cover),
						order: row.sort_order ?? 0,
					},
				});
				store.set({ id: row.slug, data, digest: generateDigest(row) });
			}

			logger.info(`Loaded ${rows.length} series from D1.`);
		},
	};
}
