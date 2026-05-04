#!/usr/bin/env node
// Promote a photo from archive/ to src/content/photos/.
// Usage: npm run publish -- <id>
import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";

const [id] = process.argv.slice(2);

if (!id) {
	console.error("Usage: npm run publish -- <id>");
	console.error("       (id is the 6-hex-char folder name in archive/)");
	process.exit(1);
}

if (!/^[0-9a-f]{6}$/.test(id)) {
	console.error(`Invalid id "${id}" — expected 6 lowercase hex chars (e.g. a3f4c1).`);
	process.exit(1);
}

const archivePath = join("archive", id);
const livePath = join("src/content/photos", id);

if (!existsSync(archivePath)) {
	console.error(`Not found: ${archivePath}`);
	console.error("Available in archive/:");
	try {
		const list = readFileSync; // noop reference to keep import slim
	} catch {}
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

renameSync(archivePath, livePath);
console.log(`Published ${id}: ${archivePath} → ${livePath}`);
console.log("");
console.log("Next: git add, git commit, git push.");
