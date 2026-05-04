#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

const photosDir = "src/content/photos";
const MAX_MB = 3;
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".avif"];

let warnings = 0;
const warn = (msg) => {
	console.log(`  ⚠ ${msg}`);
	warnings++;
};

// Each photo lives in its own folder: <id>/index.md (+ image.<ext>)
// where <id> is a zero-padded numeric directory name (e.g. 0042).
const ids = readdirSync(photosDir, { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => d.name);

console.log(`Checking ${ids.length} photo entries in ${photosDir}/\n`);

for (const id of ids) {
	if (!/^\d+$/.test(id)) {
		warn(`${id}/: directory name is not numeric — expected zero-padded id like 0042`);
	}

	const photoDir = join(photosDir, id);
	const mdPath = join(photoDir, "index.md");

	if (!existsSync(mdPath)) {
		warn(`${id}/: missing index.md`);
		continue;
	}

	const body = readFileSync(mdPath, "utf8");
	const fmMatch = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!fmMatch) {
		warn(`${id}/index.md: missing frontmatter`);
		continue;
	}
	const fm = fmMatch[1];

	const get = (key) => {
		const m = fm.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
		return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
	};

	const alt = get("alt");
	const image = get("image");

	if (!alt) warn(`${id}: missing alt text`);

	// Image checks: ref + existence + size
	if (!image) {
		warn(`${id}: missing image`);
	} else {
		const resolved = resolve(dirname(mdPath), image);
		if (!existsSync(resolved)) {
			warn(`${id}: image not found at ${resolved}`);
		} else {
			const sizeMb = statSync(resolved).size / 1024 / 1024;
			if (sizeMb > MAX_MB) {
				warn(
					`${id}: ${sizeMb.toFixed(1)} MB > ${MAX_MB} MB. Consider re-exporting smaller.`,
				);
			}
		}
	}

	// Orphan asset detection: any image files in the photo dir not referenced
	const dirFiles = readdirSync(photoDir);
	const imgFiles = dirFiles.filter((f) =>
		IMAGE_EXTS.includes(extname(f).toLowerCase()),
	);
	const refBase = image ? image.replace(/^\.\//, "") : "";
	for (const img of imgFiles) {
		if (img !== refBase) {
			warn(`${id}/${img}: orphan image, frontmatter references ${refBase || "(none)"}`);
		}
	}
}

console.log("");
if (warnings === 0) {
	console.log("✓ All photos pass.");
	process.exit(0);
} else {
	console.log(`${warnings} warning(s).`);
	process.exit(0);
}
