#!/usr/bin/env node
// See every frame, edit one, write straight into the collection.
// Usage: yarn photo-form. Env: PORT. Localhost only — it edits the working tree,
// which is also the whole of its security model. See AGENTS.md.
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import sharp from "sharp";
import {
	cleanTag,
	entryTemplate,
	findImageFile,
	frontmatter,
	IMAGE_EXTS,
	idsIn,
	LIVE_DIR,
	newId,
	parseTags,
	setFrontmatter,
} from "./lib/entries.mjs";

const PORT = Number(process.env.PORT) || 4331;
const PAGE = new URL("./form.html", import.meta.url);

// The page links the site's stylesheet rather than restating its palette.
const STATIC = {
	"/global.css": ["src/styles/global.css", "text/css; charset=utf-8"],
	"/grain.svg": ["public/grain.svg", "image/svg+xml"],
};

// Base64 of a 3 MB jpg is ~4 MB. The cap is slack, not a policy.
const MAX_BODY = 32 * 1024 * 1024;

// Florence-2 reads these. An avif upload lands fine, it just gets no suggestion.
const TAGGABLE = [".jpg", ".jpeg", ".png", ".webp"];

const TEXT_FIELDS = ["alt", "caption", "lens", "film", "location", "format", "notes", "scene"];

// Offered as dropdowns, so a value is typed once, ever.
const VOCAB_FIELDS = ["lens", "film", "format", "location", "series"];

const mdPathFor = (id) => join(LIVE_DIR, id, "index.md");

function readEntry(id) {
	const get = frontmatter(mdPathFor(id));
	if (!get) return null;
	const entry = { id, tags: parseTags(get("tags")) };
	for (const key of ["added", "year", "image", "series", ...TEXT_FIELDS]) {
		entry[key] = get(key);
	}
	return entry;
}

// Frequency first: the lens on half the catalogue sits at the top of its own list.
function vocabulary(entries) {
	const vocab = {};
	for (const field of VOCAB_FIELDS) {
		const counts = new Map();
		for (const entry of entries) {
			const value = (entry[field] || "").trim();
			if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
		}
		vocab[field] = [...counts.entries()]
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.map(([value, count]) => ({ value, count }));
	}

	const tagCounts = new Map();
	for (const entry of entries) {
		for (const tag of entry.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
	}
	vocab.tags = [...tagCounts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([value, count]) => ({ value, count }));

	return vocab;
}

function state() {
	const entries = idsIn(LIVE_DIR)
		.map(readEntry)
		.filter(Boolean)
		.sort((a, b) => b.added.localeCompare(a.added) || a.id.localeCompare(b.id));
	return { entries, vocab: vocabulary(entries) };
}

// In memory and keyed by mtime — no cache directory to gitignore.
const thumbs = new Map();
async function thumbnail(id, width) {
	const file = findImageFile(id);
	if (!file) return null;
	const key = `${id}:${width}:${statSync(file).mtimeMs}`;
	if (!thumbs.has(key)) {
		thumbs.set(key, await sharp(file).resize({ width, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer());
	}
	return thumbs.get(key);
}

function readBody(req) {
	return new Promise((done, fail) => {
		let size = 0;
		const chunks = [];
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > MAX_BODY) {
				fail(new Error(`Body over ${MAX_BODY / 1024 / 1024} MB`));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => {
			try {
				done(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
			} catch (err) {
				fail(new Error(`Bad JSON body: ${err.message}`));
			}
		});
		req.on("error", fail);
	});
}

// Only the fields the form owns, coerced the way the schema wants them.
function sanitise(fields) {
	const out = {};
	for (const key of TEXT_FIELDS) {
		if (key in fields) out[key] = String(fields[key] ?? "").trim();
	}
	if ("year" in fields) {
		const year = Number.parseInt(fields.year, 10);
		out.year = Number.isInteger(year) && year >= 1800 ? String(year) : "";
	}
	if ("series" in fields) {
		out.series = String(fields.series ?? "")
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");
	}
	if ("tags" in fields) {
		const seen = new Set();
		out.tags = (Array.isArray(fields.tags) ? fields.tags : parseTags(fields.tags))
			.map(cleanTag)
			.filter((tag) => tag && !seen.has(tag) && seen.add(tag));
	}
	return out;
}

async function createEntry({ filename, data, fields }) {
	if (!data) throw new Error("No image in the upload");

	const ext = (extname(filename || "") || ".jpg").toLowerCase();
	if (!IMAGE_EXTS.includes(ext)) {
		throw new Error(`${ext} is not one of ${IMAGE_EXTS.join(", ")}`);
	}

	// Decoded first: a bad drop shouldn't leave a folder for check-photos to flag.
	const buffer = Buffer.from(data, "base64");
	const { width, height } = await sharp(buffer).metadata();
	if (!width || !height) throw new Error(`${filename} is not an image sharp can read`);

	const mb = buffer.length / 1024 / 1024;
	if (mb > 3) console.log(`  ! ${filename} is ${mb.toFixed(1)} MB — check-photos warns over 3`);

	const id = newId();
	const dir = join(LIVE_DIR, id);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `image${ext}`), buffer);

	writeFileSync(
		mdPathFor(id),
		entryTemplate({
			added: new Date().toISOString().slice(0, 10),
			imageRef: `./image${ext}`,
			...sanitise(fields ?? {}),
		}),
	);
	return id;
}

// Dynamic: the model chain costs seconds and ~800 MB, and most sessions skip it.
async function suggest(id) {
	const file = findImageFile(id);
	if (!file) throw new Error(`No image in ${id}/`);
	if (!TAGGABLE.includes(extname(file).toLowerCase())) {
		throw new Error(`${extname(file)} can't be read — use jpg, png or webp`);
	}
	const { tagImage } = await import("./suggest-tags.mjs");
	const { caption, alt, tags } = await tagImage(file);
	return { scene: caption, alt, tags };
}

const send = (res, code, body, type = "application/json") => {
	res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
	res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

const server = createServer(async (req, res) => {
	const url = new URL(req.url, `http://localhost:${PORT}`);
	const path = url.pathname;

	try {
		if (req.method === "GET" && (path === "/" || path === "/index.html")) {
			return send(res, 200, readFileSync(PAGE), "text/html; charset=utf-8");
		}

		if (req.method === "GET" && path in STATIC) {
			const [file, type] = STATIC[path];
			return send(res, 200, readFileSync(file), type);
		}

		if (req.method === "GET" && path === "/api/state") {
			return send(res, 200, state());
		}

		const thumbMatch = path.match(/^\/thumb\/([0-9a-f]{6})$/);
		if (req.method === "GET" && thumbMatch) {
			const width = Math.min(Number(url.searchParams.get("w")) || 480, 1600);
			const buffer = await thumbnail(thumbMatch[1], width);
			if (!buffer) return send(res, 404, { error: "No image" });
			return send(res, 200, buffer, "image/webp");
		}

		if (req.method === "POST" && path === "/api/entries") {
			const id = await createEntry(await readBody(req));
			console.log(`  + ${id}  created`);
			return send(res, 201, { id, ...state() });
		}

		const entryMatch = path.match(/^\/api\/entries\/([0-9a-f]{6})$/);
		if (req.method === "PATCH" && entryMatch) {
			const id = entryMatch[1];
			if (!existsSync(mdPathFor(id))) return send(res, 404, { error: `No entry ${id}` });
			setFrontmatter(mdPathFor(id), sanitise((await readBody(req)).fields ?? {}));
			console.log(`  ~ ${id}  saved`);
			return send(res, 200, state());
		}

		const suggestMatch = path.match(/^\/api\/entries\/([0-9a-f]{6})\/suggest$/);
		if (req.method === "POST" && suggestMatch) {
			console.log(`  ? ${suggestMatch[1]}  reading image (vision model) ...`);
			return send(res, 200, await suggest(suggestMatch[1]));
		}

		send(res, 404, { error: `No route for ${req.method} ${path}` });
	} catch (err) {
		console.error(`  ✗ ${req.method} ${path}: ${err.message}`);
		send(res, 400, { error: err.message });
	}
});

// 127.0.0.1, never 0.0.0.0: this writes to the repo, so it stays on this machine.
server.listen(PORT, "127.0.0.1", () => {
	const { entries } = state();
	console.log(`\nBench open at http://localhost:${PORT}`);
	console.log(`  ${entries.length} entries in ${resolve(LIVE_DIR)}`);
	console.log("  Writes straight into the collection — yarn dev renders it live.");
	console.log("  Ctrl-C to close.\n");
});
