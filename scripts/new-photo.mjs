#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

const [imagePath] = process.argv.slice(2);

const photosRoot = "src/content/photos";
mkdirSync(photosRoot, { recursive: true });

// Find next id: scan for numeric directory names, pick max + 1, zero-pad to 4.
const existingIds = readdirSync(photosRoot, { withFileTypes: true })
	.filter((d) => d.isDirectory() && /^\d+$/.test(d.name))
	.map((d) => parseInt(d.name, 10));
const nextNum = existingIds.length === 0 ? 1 : Math.max(...existingIds) + 1;
const id = String(nextNum).padStart(4, "0");

const photoDir = join(photosRoot, id);
const mdPath = join(photoDir, "index.md");

mkdirSync(photoDir, { recursive: true });

let imageRef = "./image.jpg";
let imageNote = `Drop image at ${join(photoDir, "image.jpg")} before publishing.`;

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
date: ${today}
image: ${imageRef}
alt: ""
caption: ""
camera: ""
film: ""
location: ""
format: ""
# series: city  # optional — slug of a file in src/content/series/
tags: []
---

`;

writeFileSync(mdPath, tpl);

console.log(`Created  ${mdPath}`);
console.log(`         ${imageNote}`);
console.log("");
console.log("Next: fill frontmatter, write notes, commit, push.");
