#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { tagImage } from "./suggest-tags.mjs";

// `--no-tags` skips the (slowish) local vision tagging step.
// A bare `--` is dropped: yarn passes it straight through (npm eats it), so
// `yarn photo -- x.jpg` and `yarn photo x.jpg` both work.
const rawArgs = process.argv.slice(2).filter((a) => a !== "--");
const skipTags = rawArgs.includes("--no-tags");
const [imagePath] = rawArgs.filter((a) => !a.startsWith("--"));
const TAGGABLE = [".jpg", ".jpeg", ".png", ".webp"];

const liveDir = "src/content/photos";
const archiveDir = "archive";
mkdirSync(liveDir, { recursive: true });
mkdirSync(archiveDir, { recursive: true });

// Existing ids across BOTH dirs — used to dodge the (vanishingly rare)
// hash collision. 6 hex chars = 16M space, birthday collision ~4k.
function existingIds() {
	const fromLive = readdirSync(liveDir, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name);
	const fromArchive = readdirSync(archiveDir, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name);
	return new Set([...fromLive, ...fromArchive]);
}

function newId() {
	const taken = existingIds();
	for (let attempt = 0; attempt < 8; attempt++) {
		const id = randomBytes(3).toString("hex"); // 6 hex chars
		if (!taken.has(id)) return id;
	}
	console.error("Failed to generate unique id after 8 attempts. Archive size?");
	process.exit(1);
}

const id = newId();

// New entries land in archive/ — promote to live with `yarn publish`.
const photoDir = join(archiveDir, id);
const mdPath = join(photoDir, "index.md");

mkdirSync(photoDir, { recursive: true });

let imageRef = "./image.jpg";
let imageNote = `Drop image at ${join(photoDir, "image.jpg")} when ready.`;
let copiedImage = null; // path of the copied image, if any (for tagging)

if (imagePath) {
	if (!existsSync(imagePath)) {
		console.error(`Image not found: ${imagePath}`);
		process.exit(1);
	}
	const ext = (extname(imagePath) || ".jpg").toLowerCase();
	const dest = join(photoDir, `image${ext}`);
	copyFileSync(imagePath, dest);
	imageRef = `./image${ext}`;
	imageNote = `Copied ${basename(imagePath)} → ${dest}`;
	copiedImage = dest;
}

// Suggest tags from the image with the local vision model. Results go into the
// frontmatter as a comment — never auto-applied, so you still review. Failures
// (or non-taggable formats like TIFF) are non-fatal: the photo is created either
// way. Skip with `--no-tags`.
let tagComment = "";
if (copiedImage && !skipTags) {
	const ext = extname(copiedImage).toLowerCase();
	if (!TAGGABLE.includes(ext)) {
		console.log(`Skipping tag suggestions — ${ext} not supported (use jpg/png/webp).`);
	} else {
		try {
			console.log("Suggesting tags (local vision model) ...");
			const { caption, objectTags, captionTags } = await tagImage(copiedImage);
			const suggested = [...new Set([...objectTags, ...captionTags])];
			tagComment =
				`# --- suggested by suggest-tags (review, move keepers into tags below) ---\n` +
				`# caption: ${caption}\n` +
				`# tags: ${suggested.join(", ")}\n`;
			console.log(`  suggested: ${suggested.join(", ")}`);
		} catch (err) {
			console.log(`  (tag suggestion failed: ${err.message})`);
		}
	}
}

const today = new Date().toISOString().slice(0, 10);

const tpl = `---
added: ${today}
# date: 2024-01-01     # optional — when the photograph was made
image: ${imageRef}
alt: ""
caption: ""
lens: ""
film: ""
location: ""
format: ""
# series: city         # optional — slug of a file in src/content/series/
${tagComment}tags: []
---

`;

writeFileSync(mdPath, tpl);

console.log(`Created  ${mdPath}`);
console.log(`         ${imageNote}`);
console.log("");
console.log(`Next: fill frontmatter. When ready: yarn publish ${id}`);
