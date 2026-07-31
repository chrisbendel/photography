#!/usr/bin/env node
// Backup: D1 + R2 → markdown folders under backups/.
//
// This is the safety net that makes moving content out of git reversible. It
// regenerates exactly the folder shape the site used to build from, so restoring
// means copying backups/photos/ back to src/content/photos/ and reverting the
// loader. Run nightly in CI (.github/workflows/backup.yml) and by hand any time.
//
// Needs: CF_ACCOUNT_ID, CF_D1_DATABASE_ID, CF_D1_TOKEN, and a logged-in wrangler
// for the R2 downloads.
//
// Usage: yarn export-to-git [--no-images]

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { d1Query, hasD1Credentials } from "../src/lib/d1.mjs";

const BUCKET = "photography-photos";
const withImages = !process.argv.includes("--no-images");
const OUT = "backups";

if (!hasD1Credentials()) {
	console.error("Missing CF_ACCOUNT_ID / CF_D1_DATABASE_ID / CF_D1_TOKEN.");
	process.exit(1);
}

/** Quote only when the value could confuse a YAML parser. */
function yamlValue(value) {
	const s = String(value);
	return /^[\w.\-/ ]*$/.test(s) && !s.startsWith(" ") && !s.endsWith(" ")
		? s
		: JSON.stringify(s);
}

function frontmatter(pairs) {
	return pairs
		.filter(([, v]) => v !== null && v !== undefined && v !== "")
		.map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(", ")}]` : yamlValue(v)}`)
		.join("\n");
}

// Start clean so deletions in D1 propagate to the backup rather than lingering.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "photos"), { recursive: true });
mkdirSync(join(OUT, "series"), { recursive: true });

const photos = await d1Query(
	`SELECT id, added, date, alt, caption, camera, film, location, format,
	        series, notes, image_key, width, height, published
	 FROM photos ORDER BY added DESC, id`,
);
const tagRows = await d1Query("SELECT photo_id, tag FROM photo_tags ORDER BY tag");
const seriesRows = await d1Query(
	"SELECT slug, title, description, cover, sort_order FROM series ORDER BY sort_order, title",
);

const tagsByPhoto = new Map();
for (const { photo_id, tag } of tagRows) {
	tagsByPhoto.set(photo_id, [...(tagsByPhoto.get(photo_id) ?? []), tag]);
}

for (const row of seriesRows) {
	const md = `---\n${frontmatter([
		["title", row.title],
		["description", row.description],
		["cover", row.cover],
		["order", row.sort_order],
	])}\n---\n`;
	writeFileSync(join(OUT, "series", `${row.slug}.md`), md);
}
console.log(`${seriesRows.length} series`);

for (const row of photos) {
	const dir = join(OUT, "photos", row.id);
	mkdirSync(dir, { recursive: true });

	const ext = extname(row.image_key) || ".jpg";
	const tags = tagsByPhoto.get(row.id) ?? [];
	const md = `---\n${frontmatter([
		["added", row.added],
		["date", row.date],
		["image", `./image${ext}`],
		["alt", row.alt],
		["caption", row.caption],
		["camera", row.camera],
		["film", row.film],
		["location", row.location],
		["format", row.format],
		["series", row.series],
		["published", row.published ? "true" : "false"],
		["tags", tags],
	])}\n---\n\n${row.notes ? `${row.notes}\n` : ""}`;
	writeFileSync(join(dir, "index.md"), md);

	if (withImages) {
		execFileSync(
			"npx",
			[
				"wrangler",
				"r2",
				"object",
				"get",
				`${BUCKET}/${row.image_key}`,
				"--file",
				join(dir, `image${ext}`),
				"--remote",
			],
			{ stdio: ["ignore", "ignore", "inherit"] },
		);
	}

	console.log(`${row.id}  ${row.published ? "published" : "draft"}${withImages ? "" : "  (metadata only)"}`);
}

console.log(`\nExported ${photos.length} photo(s) to ${OUT}/.`);
console.log("Commit it, and the repo is a complete restore point again.");
