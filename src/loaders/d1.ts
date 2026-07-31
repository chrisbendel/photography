// Content collection loaders backed by D1.
//
// These run at build time, so every public page stays prerendered with zero
// client JS — the same output as when entries were markdown files. Only the
// source of the data changed, which is why the page templates barely differ.
//
// Without D1 credentials the collections load empty rather than failing, so a
// fresh clone can still build (you get the "no photographs yet" states).

import { execFileSync } from "node:child_process";
import type { Loader } from "astro/loaders";

// LOCAL_D1=1 reads the emulated database that `wrangler dev` writes to, instead of
// production over REST. Without it, a local /studio would be editing one database
// while the pages around it were built from another. Set by `yarn dev:local`.
const LOCAL = (process.env.LOCAL_D1 ?? import.meta.env.LOCAL_D1) === "1";

// Vite loads `.env` into `import.meta.env`, not `process.env`. The process.env
// fallback covers CI (Workers Builds), where these arrive as real environment
// variables and no `.env` file exists.
const ACCOUNT_ID = import.meta.env.CLOUDFLARE_ACCOUNT_ID ?? process.env.CLOUDFLARE_ACCOUNT_ID;
const DATABASE_ID =
	import.meta.env.CLOUDFLARE_D1_DATABASE_ID ?? process.env.CLOUDFLARE_D1_DATABASE_ID;
const TOKEN = import.meta.env.CLOUDFLARE_D1_TOKEN ?? process.env.CLOUDFLARE_D1_TOKEN;

const hasCredentials = LOCAL || Boolean(ACCOUNT_ID && DATABASE_ID && TOKEN);

/**
 * The emulated database, via wrangler rather than by opening miniflare's SQLite
 * file directly — wrangler owns that path, and it moves between versions.
 */
function localQuery(sql: string): Record<string, any>[] {
	const out = execFileSync(
		"npx",
		["wrangler", "d1", "execute", "photography", "--local", "--json", "--command", sql],
		{ encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
	);
	return JSON.parse(out)[0]?.results ?? [];
}

/**
 * One statement against D1's REST API. The Worker uses its `DB` binding instead;
 * this exists because the build runs outside the Worker runtime.
 */
async function d1Query(sql: string, params: unknown[] = []): Promise<Record<string, any>[]> {
	if (LOCAL) {
		if (params.length > 0) throw new Error("Local D1 reads don't support parameters.");
		return localQuery(sql);
	}

	const res = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`,
		{
			method: "POST",
			headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
			body: JSON.stringify({ sql, params }),
		},
	);

	const json = (await res.json()) as {
		success?: boolean;
		result?: { results?: Record<string, any>[] }[];
		errors?: { message: string }[];
	};

	if (!res.ok || !json.success) {
		const detail = (json.errors ?? []).map((e) => e.message).join("; ");
		throw new Error(`D1 query failed (${res.status}): ${detail || res.statusText}`);
	}

	return json.result?.[0]?.results ?? [];
}

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

			if (!hasCredentials) {
				logger.warn("No D1 credentials — photos collection will be empty.");
				return;
			}

			const rows = await d1Query(
				`SELECT id, added, date, alt, caption, lens, film, location, format,
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
						lens: optional(row.lens),
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

			if (!hasCredentials) {
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
