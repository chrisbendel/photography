#!/usr/bin/env node
// Scaffold a new entry, live immediately. Usage: yarn photo <image> [--no-tags]
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { cliArgs, idsIn, LIVE_DIR } from "./lib/entries.mjs";
import { suggestSeries, tagImage } from "./suggest-tags.mjs";

const args = cliArgs();
const skipTags = args.includes("--no-tags");
const [imagePath] = args.filter((a) => !a.startsWith("--"));
const TAGGABLE = [".jpg", ".jpeg", ".png", ".webp"];

mkdirSync(LIVE_DIR, { recursive: true });

function newId() {
	const taken = new Set(idsIn(LIVE_DIR));
	for (let attempt = 0; attempt < 8; attempt++) {
		const id = randomBytes(3).toString("hex");
		if (!taken.has(id)) return id;
	}
	console.error("Failed to generate unique id after 8 attempts. Archive size?");
	process.exit(1);
}

const id = newId();
const photoDir = join(LIVE_DIR, id);
mkdirSync(photoDir, { recursive: true });

let imageRef = "./image.jpg";
let imageNote = `Drop image at ${join(photoDir, "image.jpg")} when ready.`;
let copiedImage = null;
// The only human handle on an entry until alt is filled in.
let scanNote = "";

if (imagePath) {
	if (!existsSync(imagePath)) {
		console.error(`Image not found: ${imagePath}`);
		process.exit(1);
	}
	const ext = (extname(imagePath) || ".jpg").toLowerCase();
	copiedImage = join(photoDir, `image${ext}`);
	copyFileSync(imagePath, copiedImage);
	imageRef = `./image${ext}`;
	imageNote = `Copied ${basename(imagePath)} → ${copiedImage}`;
	scanNote = `# scan: ${basename(imagePath)}\n`;
}

// Comments only, never `tags:`. A failure here must not lose the scaffold.
let tagComment = "";
let series = "";
if (copiedImage && !skipTags) {
	const ext = extname(copiedImage).toLowerCase();
	if (!TAGGABLE.includes(ext)) {
		console.log(`Skipping tag suggestions — ${ext} not supported (use jpg/png/webp).`);
	} else {
		try {
			console.log("Suggesting tags (local vision model) ...");
			const { caption, tags } = await tagImage(copiedImage);
			tagComment =
				`# --- suggested (review, move keepers into tags below) ---\n` +
				`# caption: ${caption}\n` +
				`# tags: ${tags.join(", ")}\n`;
			console.log(`  suggested: ${tags.join(", ")}`);

			series = suggestSeries(tags);
			console.log(
				series
					? `  series:    ${series}`
					: "  series:    (no match — left blank, name one to start it)",
			);
		} catch (err) {
			console.log(`  (tag suggestion failed: ${err.message})`);
		}
	}
}

// Fields blank, not commented out — filling one in beats remembering it exists.
const mdPath = join(photoDir, "index.md");
writeFileSync(
	mdPath,
	`---
added: ${new Date().toISOString().slice(0, 10)}
${scanNote}year:
image: ${imageRef}
alt: ""
caption: ""
lens: ""
film: ""
location: ""
format: ""
series: ${series}
${tagComment}tags: []
---

`.replace(/ +$/gm, ""),
);

console.log(`Created  ${resolve(mdPath)}`);
console.log(`         ${imageNote}`);
console.log(`\nOpen:    code ${resolve(mdPath)}`);
console.log("Preview: yarn dev, then yarn check-photos before pushing.");
