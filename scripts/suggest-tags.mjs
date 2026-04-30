#!/usr/bin/env node
/**
 * Suggest tags for a photograph using a local Ollama vision model.
 *
 * Setup (one-time):
 *   brew install ollama        # or download from https://ollama.com
 *   ollama serve &             # background daemon (the macOS app does this for you)
 *   ollama pull moondream      # ~1.7GB, fast. Or `llava:7b` for better quality.
 *
 * Usage:
 *   npm run suggest-tags -- <slug>
 *   npm run suggest-tags -- --all
 *
 * Env overrides:
 *   OLLAMA_HOST  (default http://127.0.0.1:11434)
 *   OLLAMA_MODEL (default moondream)
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { Ollama } from "ollama";

const HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const MODEL = process.env.OLLAMA_MODEL || "moondream";
const PHOTOS_DIR = "src/content/photos";
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

const arg = process.argv[2];
if (!arg) {
	console.error("Usage: npm run suggest-tags -- <slug>");
	console.error("       npm run suggest-tags -- --all");
	process.exit(1);
}

const ollama = new Ollama({ host: HOST });

async function ping() {
	try {
		await ollama.list();
	} catch (err) {
		console.error(`✗ Cannot reach Ollama at ${HOST}.`);
		console.error("  Is the daemon running? Try: ollama serve");
		console.error(`  Original error: ${err.message}`);
		process.exit(1);
	}
}

function findImage(slug) {
	const dir = join(PHOTOS_DIR, slug);
	if (!existsSync(dir)) return null;
	const files = readdirSync(dir);
	const img = files.find(
		(f) =>
			f.startsWith("image.") && IMAGE_EXTS.includes(extname(f).toLowerCase()),
	);
	return img ? join(dir, img) : null;
}

function readContext(slug) {
	const mdPath = join(PHOTOS_DIR, slug, "index.md");
	if (!existsSync(mdPath)) return "";
	const md = readFileSync(mdPath, "utf8");
	const get = (key) => {
		const m = md.match(new RegExp(`^${key}:\\s*"?(.+?)"?$`, "m"));
		return m ? m[1].trim() : "";
	};
	const lines = [];
	const title = get("title");
	const caption = get("caption");
	const location = get("location");
	if (title) lines.push(`Title: ${title}`);
	if (caption) lines.push(`Caption: ${caption}`);
	if (location) lines.push(`Location: ${location}`);
	return lines.length ? lines.join("\n") + "\n\n" : "";
}

const PROMPT_TEMPLATE = (context) => `${context}You are tagging a black-and-white film photograph for a personal portfolio.

Suggest 8 short, lowercase tags. Use kebab-case for multi-word tags.
Mix:
  - concrete subjects (e.g. tree, window, hands)
  - places or context (e.g. brooklyn, interior, outdoor)
  - abstract qualities (e.g. solitude, morning-light, stillness)

Avoid generic tags like "photo", "image", "black-and-white", "film", "art".

Return ONLY a comma-separated list of tags. No commentary, no numbering.`;

async function suggest(slug) {
	const imagePath = findImage(slug);
	if (!imagePath) {
		console.error(`  ✗ No image found for "${slug}" in ${PHOTOS_DIR}/${slug}/`);
		return;
	}
	const imgB64 = readFileSync(imagePath, { encoding: "base64" });
	const context = readContext(slug);

	process.stdout.write(`  ${slug} ... `);
	const res = await ollama.generate({
		model: MODEL,
		prompt: PROMPT_TEMPLATE(context),
		images: [imgB64],
		stream: false,
		options: { temperature: 0.4 },
	});

	const tags = res.response
		.replace(/[\n\r]/g, " ")
		.split(",")
		.map((t) =>
			t
				.trim()
				.toLowerCase()
				.replace(/^[-*0-9.]+\s*/, "")
				.replace(/[.!?]+$/, "")
				.replace(/\s+/g, "-"),
		)
		.filter((t) => t && t.length > 1 && t.length < 30);

	console.log(`done`);
	console.log(`    suggested: [${tags.map((t) => `"${t}"`).join(", ")}]`);
	console.log("");
}

await ping();

const allSlugs = readdirSync(PHOTOS_DIR, { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => d.name);

const targets = arg === "--all" ? allSlugs : [arg];

console.log(`Suggesting tags via ${MODEL} @ ${HOST}\n`);

for (const slug of targets) {
	if (!allSlugs.includes(slug)) {
		console.error(`  ✗ "${slug}" — no folder found in ${PHOTOS_DIR}/`);
		continue;
	}
	try {
		await suggest(slug);
	} catch (err) {
		console.error(`  ✗ ${slug}: ${err.message}`);
	}
}

console.log("Done. Copy whatever resonates into the photo's frontmatter.");
console.log("Tags are suggestions — you decide what stays.");
