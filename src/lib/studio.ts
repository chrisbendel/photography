// D1 access for /studio, over the Worker's `DB` binding.
//
// The public site never calls any of this — it reads the same tables through the
// REST API at build time (src/loaders/d1.ts). Two paths to one database, because
// builds run outside the Worker runtime.

export type PhotoRow = {
	id: string;
	added: string;
	date: string | null;
	alt: string;
	caption: string | null;
	camera: string | null;
	film: string | null;
	location: string | null;
	format: string | null;
	series: string | null;
	notes: string | null;
	image_key: string;
	width: number | null;
	height: number | null;
	published: number;
};

export type SeriesRow = {
	slug: string;
	title: string;
	description: string | null;
	cover: string | null;
	sort_order: number;
};

const PHOTO_FIELDS = [
	"date",
	"alt",
	"caption",
	"camera",
	"film",
	"location",
	"format",
	"series",
	"notes",
] as const;

/**
 * URL for a studio preview. Goes through the Worker's R2 binding rather than the
 * public image domain, so previews work against the local emulator and a draft's
 * bytes stay off the public host until it's published.
 */
export function studioPreview(imageKey: string): string {
	return `/studio/api/image?key=${encodeURIComponent(imageKey)}`;
}

/** 6 lowercase hex chars — the id format from the markdown era, kept. */
export function isPhotoId(id: string): boolean {
	return /^[0-9a-f]{6}$/.test(id);
}

export async function newPhotoId(db: D1Database): Promise<string> {
	for (let attempt = 0; attempt < 8; attempt++) {
		const bytes = crypto.getRandomValues(new Uint8Array(3));
		const id = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
		const hit = await db.prepare("SELECT 1 FROM photos WHERE id = ?").bind(id).first();
		if (!hit) return id;
	}
	throw new Error("Could not generate a unique photo id after 8 attempts.");
}

export async function listPhotos(db: D1Database): Promise<PhotoRow[]> {
	const { results } = await db
		.prepare("SELECT * FROM photos ORDER BY published, added DESC, id")
		.all<PhotoRow>();
	return results;
}

export async function getPhoto(db: D1Database, id: string): Promise<PhotoRow | null> {
	return await db.prepare("SELECT * FROM photos WHERE id = ?").bind(id).first<PhotoRow>();
}

export async function listSeries(db: D1Database): Promise<SeriesRow[]> {
	const { results } = await db
		.prepare("SELECT * FROM series ORDER BY sort_order, title")
		.all<SeriesRow>();
	return results;
}

export async function getTags(db: D1Database, photoId: string): Promise<string[]> {
	const { results } = await db
		.prepare("SELECT tag FROM photo_tags WHERE photo_id = ? ORDER BY tag")
		.bind(photoId)
		.all<{ tag: string }>();
	return results.map((r) => r.tag);
}

export async function allTags(db: D1Database): Promise<string[]> {
	const { results } = await db
		.prepare("SELECT DISTINCT tag FROM photo_tags ORDER BY tag")
		.all<{ tag: string }>();
	return results.map((r) => r.tag);
}

export async function insertPhoto(
	db: D1Database,
	row: { id: string; added: string; alt: string; image_key: string; width?: number; height?: number },
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO photos (id, added, alt, image_key, width, height, published)
			 VALUES (?, ?, ?, ?, ?, ?, 0)`,
		)
		.bind(row.id, row.added, row.alt, row.image_key, row.width ?? null, row.height ?? null)
		.run();
}

/**
 * Write the metadata fields from a submitted form. Empty strings become NULL so
 * the loader and the schema see "absent" rather than "".
 */
export async function updatePhoto(
	db: D1Database,
	id: string,
	form: FormData,
): Promise<void> {
	const value = (key: string) => {
		const raw = form.get(key);
		if (typeof raw !== "string") return null;
		const trimmed = raw.trim();
		return trimmed === "" ? null : trimmed;
	};

	const alt = value("alt");
	if (!alt) throw new Error("Alt text is required.");

	const sets = PHOTO_FIELDS.map((f) => `${f} = ?`).join(", ");
	await db
		.prepare(`UPDATE photos SET alt = ?, ${sets} WHERE id = ?`)
		.bind(alt, ...PHOTO_FIELDS.map((f) => value(f)), id)
		.run();

	// Tags arrive as one comma-separated field; replace the set wholesale.
	const tags = String(form.get("tags") ?? "")
		.split(",")
		.map((t) => t.trim().toLowerCase())
		.filter(Boolean);

	await db.prepare("DELETE FROM photo_tags WHERE photo_id = ?").bind(id).run();
	if (tags.length > 0) {
		const unique = [...new Set(tags)];
		await db.batch(
			unique.map((tag) =>
				db
					.prepare("INSERT OR IGNORE INTO photo_tags (photo_id, tag) VALUES (?, ?)")
					.bind(id, tag),
			),
		);
	}
}

/**
 * A series named but not yet defined gets created, mirroring what `yarn publish`
 * used to do with a missing series file: naming a new series is how you start one.
 */
export async function ensureSeries(db: D1Database, slug: string): Promise<void> {
	const existing = await db.prepare("SELECT 1 FROM series WHERE slug = ?").bind(slug).first();
	if (existing) return;

	const title = slug
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
	await db
		.prepare("INSERT INTO series (slug, title, sort_order) VALUES (?, ?, 0)")
		.bind(slug, title)
		.run();
}

export async function setPublished(
	db: D1Database,
	id: string,
	published: boolean,
): Promise<void> {
	await db
		.prepare("UPDATE photos SET published = ? WHERE id = ?")
		.bind(published ? 1 : 0, id)
		.run();
}

export async function deletePhoto(
	db: D1Database,
	bucket: R2Bucket,
	id: string,
): Promise<void> {
	const row = await getPhoto(db, id);
	if (!row) return;
	await bucket.delete(row.image_key);
	await db.prepare("DELETE FROM photo_tags WHERE photo_id = ?").bind(id).run();
	await db.prepare("DELETE FROM photos WHERE id = ?").bind(id).run();
}

/**
 * Caption and tag suggestions from Workers AI, over its REST API rather than the
 * `AI` binding — binding it would force every build into a remote proxy session,
 * since Workers AI has no local emulation.
 *
 * Suggestions only. You decide what a photograph means.
 */
export async function suggestFromImage(
	env: { CLOUDFLARE_ACCOUNT_ID?: string; CLOUDFLARE_AI_TOKEN?: string },
	bytes: ArrayBuffer,
): Promise<{ caption: string; tags: string[] }> {
	if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_AI_TOKEN) {
		throw new Error("Suggestions need CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN set as secrets.");
	}

	const res = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/llava-hf/llava-1.5-7b-hf`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${env.CLOUDFLARE_AI_TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				image: [...new Uint8Array(bytes)],
				max_tokens: 256,
				prompt:
					"Describe this photograph in one short sentence. Then on a new line " +
					'beginning with "TAGS:", list 5-10 lowercase keywords separated by commas.',
			}),
		},
	);

	const json = await res.json<{
		success?: boolean;
		result?: { description?: string };
		errors?: { message: string }[];
	}>();

	if (!res.ok || !json.success) {
		const detail = (json.errors ?? []).map((e) => e.message).join("; ");
		throw new Error(`Workers AI failed (${res.status}): ${detail || res.statusText}`);
	}

	const text = json.result?.description ?? "";
	const [before, after] = text.split(/TAGS:/i);
	const tags = (after ?? "")
		.split(",")
		.map((t) =>
			t
				.trim()
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-|-$/g, ""),
		)
		.filter(Boolean);

	return { caption: before.trim(), tags: [...new Set(tags)] };
}

/**
 * Ask the deploy hook for a rebuild. Publishing changes D1, but the public pages
 * are prerendered, so nothing is live until a build runs. Returns false when no
 * hook is configured (local dev, or before CI is wired up).
 */
export async function triggerRebuild(hookUrl: string | undefined): Promise<boolean> {
	if (!hookUrl) return false;
	const res = await fetch(hookUrl, { method: "POST" });
	if (!res.ok) throw new Error(`Deploy hook failed: ${res.status} ${res.statusText}`);
	return true;
}
