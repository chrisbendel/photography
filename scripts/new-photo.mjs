#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

const [imagePath] = process.argv.slice(2);

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

// New entries land in archive/ — promote to live with `npm run publish`.
const photoDir = join(archiveDir, id);
const mdPath = join(photoDir, "index.md");

mkdirSync(photoDir, { recursive: true });

let imageRef = "./image.jpg";
let imageNote = `Drop image at ${join(photoDir, "image.jpg")} when ready.`;

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
}

const today = new Date().toISOString().slice(0, 10);

const tpl = `---
added: ${today}
# date: 2024-01-01     # optional — when the photograph was made
image: ${imageRef}
alt: ""
caption: ""
camera: ""
film: ""
location: ""
format: ""
# series: city         # optional — slug of a file in src/content/series/
tags: []
---

`;

writeFileSync(mdPath, tpl);

console.log(`Created  ${mdPath}`);
console.log(`         ${imageNote}`);
console.log("");
console.log(`Next: fill frontmatter. When ready: npm run publish -- ${id}`);
