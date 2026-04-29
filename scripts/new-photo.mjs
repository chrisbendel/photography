#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

const [slug, imagePath] = process.argv.slice(2);

if (!slug) {
	console.error("Usage: npm run new-photo -- <slug> [path/to/image.jpg]");
	console.error("Example: npm run new-photo -- morning-window ~/Desktop/scan.jpg");
	process.exit(1);
}

if (!/^[a-z0-9-]+$/.test(slug)) {
	console.error(`Bad slug "${slug}". Use lowercase letters, digits, hyphens only.`);
	process.exit(1);
}

const dir = "src/content/photos";
mkdirSync(dir, { recursive: true });

const mdPath = join(dir, `${slug}.md`);
if (existsSync(mdPath)) {
	console.error(`${mdPath} already exists. Pick a different slug.`);
	process.exit(1);
}

let imageRef = `./${slug}.jpg`;
let imageNote = `Drop image at ${join(dir, slug + ".jpg")} before publishing.`;

if (imagePath) {
	if (!existsSync(imagePath)) {
		console.error(`Image not found: ${imagePath}`);
		process.exit(1);
	}
	const ext = (extname(imagePath) || ".jpg").toLowerCase();
	const dest = join(dir, `${slug}${ext}`);
	copyFileSync(imagePath, dest);
	imageRef = `./${slug}${ext}`;
	imageNote = `Copied ${basename(imagePath)} → ${dest}`;
}

const today = new Date().toISOString().slice(0, 10);

const tpl = `---
title: ""
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
draft: true
---

`;

writeFileSync(mdPath, tpl);

console.log(`Created  ${mdPath}`);
console.log(`         ${imageNote}`);
console.log("");
console.log("Next: fill frontmatter, write notes, flip draft: false to publish.");
