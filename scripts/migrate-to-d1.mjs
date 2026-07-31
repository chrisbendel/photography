#!/usr/bin/env node
// One-time migration: markdown-in-git → D1 + R2.
//
// Reads every photo folder (published and archived) plus the series files,
// uploads images to R2, and inserts rows. Idempotent — keyed by photo id, so
// it's safe to re-run while iterating on the schema.
//
// Needs: CF_ACCOUNT_ID, CF_D1_DATABASE_ID, CF_D1_TOKEN, and a logged-in wrangler
// (`wrangler login`) for the R2 uploads.
//
// Usage: yarn migrate-to-d1 [--dry-run]

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import sharp from "sharp";
import { d1Query, hasD1Credentials } from "../src/lib/d1.mjs";

const BUCKET = "photography-photos";
const dryRun = process.argv.includes("--dry-run");

if (!hasD1Credentials()) {
	console.error("Missing CF_ACCOUNT_ID / CF_D1_DATABASE_ID / CF_D1_TOKEN.");
	console.error("See docs/r2-d1-cms.md for where these come from.");
	process.exit(1);
}

/** Frontmatter parser for the shapes this repo's own scaffolding produced. */
function parseFrontmatter(md) {
	const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) return null;
	const [, fm, body] = match;
	const data = {};

	for (const line of fm.split(/\r?\n/)) {
		if (!line.trim() || line.trimStart().startsWith("#")) continue;
		const kv = line.match(/^([a-z_]+):\s*(.*)$/i);
		if (!kv) continue;
		const [, key, rawValue] = kv;
		const value = rawValue.trim().replace(/\s+#.*$/, "");

		if (value.startsWith("[")) {
			data[key] = value
				.slice(1, value.endsWith("]") ? -1 : undefined)
				.split(",")
				.map((v) => v.trim().replace(/^["']|["']$/g, ""))
				.filter(Boolean);
		} else {
			data[key] = value.replace(/^["']|["']$/g, "");
		}
	}

	return { data, body: body.trim() };
}

function collectPhotoDirs() {
	const dirs = [];
	for (const [base, published] of [
		["src/content/photos", 1],
		["archive", 0],
	]) {
		if (!existsSync(base)) continue;
		for (const entry of readdirSync(base, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			if (existsSync(join(base, entry.name, "index.md"))) {
				dirs.push({ id: entry.name, dir: join(base, entry.name), published });
			}
		}
	}
	return dirs;
}

function uploadToR2(key, file, contentType) {
	if (dryRun) return;
	execFileSync(
		"npx",
		[
			"wrangler",
			"r2",
			"object",
			"put",
			`${BUCKET}/${key}`,
			"--file",
			file,
			"--content-type",
			contentType,
			"--cache-control",
			"public, max-age=31536000, immutable",
			"--remote",
		],
		{ stdio: ["ignore", "ignore", "inherit"] },
	);
}

const CONTENT_TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

// --- series -----------------------------------------------------------------

const seriesDir = "src/content/series";
const seriesFiles = existsSync(seriesDir)
	? readdirSync(seriesDir).filter((f) => f.endsWith(".md"))
	: [];

for (const file of seriesFiles) {
	const slug = file.replace(/\.md$/, "");
	const parsed = parseFrontmatter(readFileSync(join(seriesDir, file), "utf8"));
	if (!parsed) {
		console.warn(`  ! ${file}: no frontmatter, skipped`);
		continue;
	}
	const { title, description, cover, order } = parsed.data;
	console.log(`series ${slug} — ${title}`);
	if (!dryRun) {
		await d1Query(
			`INSERT INTO series (slug, title, description, cover, sort_order)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(slug) DO UPDATE SET
			   title = excluded.title,
			   description = excluded.description,
			   cover = excluded.cover,
			   sort_order = excluded.sort_order`,
			[slug, title ?? slug, description ?? null, cover ?? null, Number(order ?? 0)],
		);
	}
}

// --- photos -----------------------------------------------------------------

const dirs = collectPhotoDirs();
console.log(`\n${dirs.length} photo folder(s) to migrate\n`);

for (const { id, dir, published } of dirs) {
	const parsed = parseFrontmatter(readFileSync(join(dir, "index.md"), "utf8"));
	if (!parsed) {
		console.warn(`  ! ${id}: no frontmatter, skipped`);
		continue;
	}
	const { data, body } = parsed;

	const imageRef = (data.image ?? "./image.jpg").replace(/^\.\//, "");
	const imagePath = join(dir, imageRef);
	if (!existsSync(imagePath)) {
		console.warn(`  ! ${id}: image missing at ${imagePath}, skipped`);
		continue;
	}

	const ext = extname(imagePath).toLowerCase();
	const contentType = CONTENT_TYPES[ext];
	if (!contentType) {
		console.warn(`  ! ${id}: unsupported image type ${ext}, skipped`);
		continue;
	}

	const bytes = readFileSync(imagePath);
	const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
	const key = `photos/${id}/${hash}${ext}`;
	const { width, height } = await sharp(bytes).metadata();

	console.log(`${id}  ${published ? "published" : "draft"}  ${key}  ${width}×${height}`);
	uploadToR2(key, imagePath, contentType);

	if (dryRun) continue;

	await d1Query(
		`INSERT INTO photos (id, added, date, alt, caption, camera, film, location,
		                     format, series, notes, image_key, width, height, published)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET
		   added = excluded.added, date = excluded.date, alt = excluded.alt,
		   caption = excluded.caption, camera = excluded.camera, film = excluded.film,
		   location = excluded.location, format = excluded.format,
		   series = excluded.series, notes = excluded.notes,
		   image_key = excluded.image_key, width = excluded.width,
		   height = excluded.height, published = excluded.published`,
		[
			id,
			data.added ?? new Date().toISOString().slice(0, 10),
			data.date || null,
			data.alt ?? "",
			data.caption || null,
			data.camera || null,
			data.film || null,
			data.location || null,
			data.format || null,
			data.series || null,
			body || null,
			key,
			width ?? null,
			height ?? null,
			published,
		],
	);

	const tags = Array.isArray(data.tags) ? data.tags : [];
	await d1Query("DELETE FROM photo_tags WHERE photo_id = ?", [id]);
	for (const tag of [...new Set(tags)]) {
		await d1Query("INSERT OR IGNORE INTO photo_tags (photo_id, tag) VALUES (?, ?)", [id, tag]);
	}
}

console.log(dryRun ? "\nDry run — nothing written." : "\nMigration complete.");
if (!dryRun) {
	console.log("Verify with `yarn dev`, then `yarn export-to-git` to prove the backup path.");
}
