// Shared plumbing for the photo CLI scripts.
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

export const LIVE_DIR = "src/content/photos";

export const ID_RE = /^[0-9a-f]{6}$/;

// Two lists because two questions. An avif entry displays and ships fine; it
// just gets no suggestion, because Florence-2 can't read it.
export const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".avif"];
export const TAGGABLE_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

// yarn forwards a bare `--` as an argument where npm eats it.
export function cliArgs() {
	return process.argv.slice(2).filter((a) => a !== "--");
}

export function idsIn(dir) {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name);
}

// 6-char hex, unique against what is on disk. Stable forever, so no ordering.
export function newId() {
	const taken = new Set(idsIn(LIVE_DIR));
	for (let attempt = 0; attempt < 8; attempt++) {
		const id = randomBytes(3).toString("hex");
		if (!taken.has(id)) return id;
	}
	throw new Error("Failed to generate unique id after 8 attempts. Archive size?");
}

export function findImageFile(id) {
	const dir = join(LIVE_DIR, id);
	if (!existsSync(dir)) return null;
	const img = readdirSync(dir).find(
		(f) => f.startsWith("image.") && IMAGE_EXTS.includes(extname(f).toLowerCase()),
	);
	return img ? join(dir, img) : null;
}

// `get(key)` over a file's frontmatter, or null. Regex, not YAML: flat scalars only.
export function frontmatter(mdPath) {
	if (!existsSync(mdPath)) return null;
	const match = readFileSync(mdPath, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) return null;
	return (key) => {
		// `[ \t]*` not `\s*`: `\s` eats the newline and captures the next line.
		const m = match[1].match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"));
		return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
	};
}

// A YAML double-quoted scalar. JSON strings are valid YAML, newlines included.
const scalar = (v) => JSON.stringify(v ?? "");

// Commas and brackets are stripped on the way in, so a tag can't break this.
const sequence = (tags) => `[${(tags ?? []).join(", ")}]`;

export function cleanTag(tag) {
	return String(tag).toLowerCase().replace(/[[\],]/g, "").trim();
}

export function parseTags(raw) {
	return String(raw ?? "")
		.replace(/[[\]]/g, "")
		.split(",")
		.map((t) => t.trim().replace(/^["']|["']$/g, ""))
		.filter(Boolean);
}

// Every field blank rather than commented out — filling one in beats recalling it.
export function entryTemplate({
	added,
	imageRef,
	year = "",
	alt = "",
	caption = "",
	lens = "",
	film = "",
	location = "",
	format = "",
	series = "",
	tagComment = "",
	tags = [],
	scene = "",
	notes = "",
}) {
	return `---
# Stamped at scaffold. Orders the gallery, newest first. Leave it alone.
added: ${added}
year: ${year}
image: ${imageRef}
# Required. Written for you from the image — skim it, it is what a screen reader says.
alt: ${scalar(alt)}
# One short line printed under the image. Optional.
caption: ${scalar(caption)}
lens: ${scalar(lens)}
film: ${scalar(film)}
location: ${scalar(location)}
# Written with × when shown, so type it plainly: 4x5, 6x7, 35mm.
format: ${scalar(format)}
# A slug. Naming one that doesn't exist yet is how you start it.
series: ${series}
# Lowercase search terms, any number including none. Not routes.
${tagComment}tags: ${sequence(tags)}
# What the vision model saw. Feeds search, never displayed. Machine-written.
scene: ${scalar(scene)}
# What you saw, what you decided, what you'd do differently. Plain text.
notes: ${scalar(notes)}
---

`.replace(/ +$/gm, "");
}

// One line at a time, so comments and unknown fields survive. `[ \t]*`, not `\s*`.
export function setFrontmatter(mdPath, updates) {
	const text = readFileSync(mdPath, "utf8");
	const match = text.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
	if (!match) throw new Error(`No frontmatter block in ${mdPath}`);

	// `trimEnd` keeps a blanked field flush, the way the scaffold writes it.
	const BARE = new Set(["added", "year", "series", "image"]);
	const render = (key, value) => {
		if (key === "tags") return `tags: ${sequence(value)}`;
		if (BARE.has(key)) return `${key}: ${value ?? ""}`.trimEnd();
		return `${key}: ${scalar(value)}`;
	};

	let block = match[2];
	for (const [key, value] of Object.entries(updates)) {
		const line = render(key, value);
		const re = new RegExp(`^${key}:[ \\t]*.*$`, "m");
		// A function, not a string: `$&` or `$1` in a value would be a backreference.
		block = re.test(block) ? block.replace(re, () => line) : `${block}\n${line}`;
	}

	const end = match.index + match[0].length;
	writeFileSync(mdPath, text.slice(0, match.index) + match[1] + block + match[3] + text.slice(end));
}
