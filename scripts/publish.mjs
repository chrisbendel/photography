#!/usr/bin/env node
// Promote a photo from archive/ to src/content/photos/.
// Usage: yarn publish [id]   — id optional when archive/ holds exactly one entry.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// A bare `--` is dropped: yarn passes it through where npm eats it.
const args = process.argv.slice(2).filter((a) => a !== "--");

function archiveIds() {
	if (!existsSync("archive")) return [];
	return readdirSync("archive", { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name);
}

// No id given: the common case is one photo in flight, so publish it.
let [id] = args;
if (!id) {
	const ids = archiveIds();
	if (ids.length === 1) {
		id = ids[0];
		console.log(`Only one entry in archive/ — publishing ${id}.`);
	} else {
		console.error("Usage: yarn publish <id>");
		console.error(
			ids.length === 0 ? "  archive/ is empty." : `  In archive/: ${ids.join(", ")}`,
		);
		process.exit(1);
	}
}

if (!/^[0-9a-f]{6}$/.test(id)) {
	console.error(`Invalid id "${id}" — expected 6 lowercase hex chars (e.g. a3f4c1).`);
	process.exit(1);
}

const archivePath = join("archive", id);
const livePath = join("src/content/photos", id);

if (!existsSync(archivePath)) {
	console.error(`Not found: ${archivePath}`);
	const ids = archiveIds();
	console.error(ids.length === 0 ? "archive/ is empty." : `In archive/: ${ids.join(", ")}`);
	process.exit(1);
}

if (existsSync(livePath)) {
	console.error(`Already published: ${livePath}`);
	process.exit(1);
}

// Sanity-check frontmatter has alt + image filled in.
const mdPath = join(archivePath, "index.md");
if (!existsSync(mdPath)) {
	console.error(`Missing index.md in ${archivePath}`);
	process.exit(1);
}
const md = readFileSync(mdPath, "utf8");
const fmMatch = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
if (!fmMatch) {
	console.error(`No frontmatter found in ${mdPath}`);
	process.exit(1);
}
const fm = fmMatch[1];
const get = (k) => {
	const m = fm.match(new RegExp(`^${k}:\\s*(.*)$`, "m"));
	return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
};
const alt = get("alt");
const image = get("image");
const series = get("series");

const issues = [];
if (!alt) issues.push("alt text is empty — fill it before publishing");
if (!image) issues.push("image: field is empty");
if (image && !existsSync(join(archivePath, image.replace(/^\.\//, "")))) {
	issues.push(`image not found: ${image}`);
}

if (issues.length > 0) {
	console.error(`Cannot publish ${id} yet:`);
	for (const i of issues) console.error(`  ✗ ${i}`);
	process.exit(1);
}

// A `series:` naming a file that doesn't exist yet is a dangling reference —
// Astro drops the photo from the series and warns at build. Scaffold it instead,
// so naming a new series in frontmatter is all it takes to start one. Existing
// series need nothing: the photo joins by matching the filename.
if (series) {
	const seriesDir = "src/content/series";
	const seriesPath = join(seriesDir, `${series}.md`);
	if (existsSync(seriesPath)) {
		console.log(`Joined series "${series}" (${seriesPath}).`);
	} else {
		const title = series
			.split("-")
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(" ");
		mkdirSync(seriesDir, { recursive: true });
		writeFileSync(seriesPath, `---\ntitle: "${title}"\n# description: ""\n# cover: ${id}\n---\n\n`);
		console.log(`Created series "${series}" → ${seriesPath} (edit title/description).`);
	}
}

renameSync(archivePath, livePath);
console.log(`Published ${id}: ${archivePath} → ${livePath}`);
console.log("");
console.log("Next: git add, git commit, git push.");
