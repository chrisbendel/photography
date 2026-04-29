#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { extname, join } from "node:path";

const dir = "src/content/photos";
const MAX_MB = 3;
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".avif"];

let warnings = 0;
const warn = (msg) => {
	console.log(`  ⚠ ${msg}`);
	warnings++;
};

const files = readdirSync(dir);
const mdFiles = files.filter((f) => f.endsWith(".md"));
const imageFiles = files.filter((f) => IMAGE_EXTS.includes(extname(f).toLowerCase()));

console.log(`Checking ${mdFiles.length} entries, ${imageFiles.length} images in ${dir}/\n`);

for (const f of imageFiles) {
	const p = join(dir, f);
	const sizeMb = statSync(p).size / 1024 / 1024;
	if (sizeMb > MAX_MB) {
		warn(`${f}: ${sizeMb.toFixed(1)} MB > ${MAX_MB} MB. Consider re-exporting smaller.`);
	}
}

const referencedImages = new Set();

for (const f of mdFiles) {
	const p = join(dir, f);
	const body = readFileSync(p, "utf8");
	const fmMatch = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!fmMatch) {
		warn(`${f}: missing frontmatter`);
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

	if (!title) warn(`${f}: missing title`);
	if (!alt) warn(`${f}: missing alt text`);
	if (!image) {
		warn(`${f}: missing image`);
	} else {
		const imgRel = image.replace(/^\.\//, "");
		referencedImages.add(imgRel);
		if (!existsSync(join(dir, imgRel))) {
			warn(`${f}: image not found at ${join(dir, imgRel)}`);
		}
	}

	if (!draft) {
		const bodyText = body.slice(fmMatch[0].length).trim();
		if (bodyText.length === 0) {
			warn(`${f}: published with no notes body`);
		}
	}
}

for (const img of imageFiles) {
	if (!referencedImages.has(img)) {
		warn(`${img}: orphan image, no .md references it`);
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
