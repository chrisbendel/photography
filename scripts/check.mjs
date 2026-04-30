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

// Each photo lives in its own folder: <slug>/index.md (+ image.<ext>)
const slugs = readdirSync(photosDir, { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => d.name);

console.log(`Checking ${slugs.length} photo entries in ${photosDir}/\n`);

for (const slug of slugs) {
	const photoDir = join(photosDir, slug);
	const mdPath = join(photoDir, "index.md");

	if (!existsSync(mdPath)) {
		warn(`${slug}/: missing index.md`);
		continue;
	}

	const body = readFileSync(mdPath, "utf8");
	const fmMatch = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!fmMatch) {
		warn(`${slug}/index.md: missing frontmatter`);
		continue;
	}
	const fm = fmMatch[1];

	const get = (key) => {
		const m = fm.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
		return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
	};

	const title = get("title");
	const alt = get("alt");
	const image = get("image");
	const draft = get("draft") === "true";

	if (!title) warn(`${slug}: missing title`);
	if (!alt) warn(`${slug}: missing alt text`);

	// Image checks: ref + existence + size
	if (!image) {
		warn(`${slug}: missing image`);
	} else {
		const resolved = resolve(dirname(mdPath), image);
		if (!existsSync(resolved)) {
			warn(`${slug}: image not found at ${resolved}`);
		} else {
			const sizeMb = statSync(resolved).size / 1024 / 1024;
			if (sizeMb > MAX_MB) {
				warn(
					`${slug}: ${sizeMb.toFixed(1)} MB > ${MAX_MB} MB. Consider re-exporting smaller.`,
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
			warn(`${slug}/${img}: orphan image, frontmatter references ${refBase || "(none)"}`);
		}
	}

	if (!draft) {
		const bodyText = body.slice(fmMatch[0].length).trim();
		if (bodyText.length === 0) {
			warn(`${slug}: published with no notes body`);
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
