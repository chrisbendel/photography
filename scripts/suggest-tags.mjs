#!/usr/bin/env node
/**
 * Suggest tags for a photo via a local vision model (Florence-2), run
 * in-process with transformers.js — no daemon, no API, offline after the
 * weights download once. Object detection gives concrete subject tags; a
 * detailed caption gives material to mine for mood tags. Suggestions only —
 * never written to frontmatter. Imported by new-photo.mjs (tagImage), or
 * standalone to (re)tag existing photos: `yarn suggest-tags <slug> | --all`.
 * Env: TAGGER_MODEL, TAGGER_DTYPE.
 */

import { existsSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
	Florence2ForConditionalGeneration,
	AutoProcessor,
	RawImage,
} from "@huggingface/transformers";

const MODEL = process.env.TAGGER_MODEL || "onnx-community/Florence-2-base";
const DTYPE = process.env.TAGGER_DTYPE || "fp32";
// Photos live in archive/ before publish, src/content/photos/ after.
const PHOTO_DIRS = ["archive", "src/content/photos"];
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

// Words too generic to be useful tags, stripped from caption-derived keywords.
const STOP = new Set(
	("a an the this that these those is are was were be been being of in on at to " +
		"for with from by as into over under above below near next and or but it its " +
		"there here their them they then than has have had can will would could " +
		"image photo photograph picture black white gray grey colour color overall " +
		"effect mood look feel sense thing area part way bit kind sort type view " +
		"shows showing shown depicts featuring features appears seems very much more " +
		"towards through reaching creating filtering running covered standing sitting " +
		"small large tall short several many some most other another each both " +
		"man woman people person background foreground front side scene shot center").split(
			" ",
		),
);

// Find the image file inside a photo directory (archive/<slug> or live/<slug>).
export function findImage(slug) {
	for (const base of PHOTO_DIRS) {
		const dir = join(base, slug);
		if (!existsSync(dir)) continue;
		const img = readdirSync(dir).find(
			(f) =>
				f.startsWith("image.") && IMAGE_EXTS.includes(extname(f).toLowerCase()),
		);
		if (img) return join(dir, img);
	}
	return null;
}

function clean(s) {
	return s
		.trim()
		.toLowerCase()
		.replace(/[.!?,]+$/, "")
		.replace(/\s+/g, "-");
}

// Pull candidate tag words out of a caption sentence (nouns-ish), drop stopwords.
function keywordsFromCaption(caption) {
	const words = caption
		.toLowerCase()
		.replace(/[^a-z\s-]/g, " ")
		.split(/\s+/)
		.filter((w) => w.length > 3 && !STOP.has(w));
	return [...new Set(words)];
}

// Lazily loaded once, then reused across every photo in a run.
let _m = null;
export async function loadModel() {
	if (_m) return _m;
	process.stdout.write(`Loading ${MODEL} (first run downloads weights) ... `);
	const [model, processor] = await Promise.all([
		Florence2ForConditionalGeneration.from_pretrained(MODEL, { dtype: DTYPE }),
		AutoProcessor.from_pretrained(MODEL),
	]);
	console.log("ready");
	_m = { model, processor };
	return _m;
}

async function runTask(image, task) {
	const { model, processor } = await loadModel();
	const prompts = processor.construct_prompts(task);
	const inputs = await processor(image, prompts);
	const ids = await model.generate({ ...inputs, max_new_tokens: 128 });
	const text = processor.batch_decode(ids, { skip_special_tokens: false })[0];
	return processor.post_process_generation(text, task, image.size);
}

// Core: tag a single image file. Returns { caption, objectTags, captionTags }.
// Reused by new-photo.mjs and the CLI below.
export async function tagImage(imagePath) {
	const image = await RawImage.read(imagePath);
	const od = await runTask(image, "<OD>");
	const cap = await runTask(image, "<MORE_DETAILED_CAPTION>");

	const labels = od["<OD>"]?.labels ?? [];
	const objectTags = [...new Set(labels.map(clean))].filter(Boolean);
	const caption = (cap["<MORE_DETAILED_CAPTION>"] ?? "").trim();
	const captionTags = keywordsFromCaption(caption);
	return { caption, objectTags, captionTags };
}

async function suggestForSlug(slug) {
	const imagePath = findImage(slug);
	if (!imagePath) {
		console.error(`  ✗ No image found for "${slug}" in archive/ or live.`);
		return;
	}
	process.stdout.write(`  ${slug} ... `);
	const { caption, objectTags, captionTags } = await tagImage(imagePath);
	console.log("done");
	console.log(`    caption: ${caption}`);
	console.log(`    object tags: [${objectTags.map((t) => `"${t}"`).join(", ")}]`);
	console.log(`    from caption: [${captionTags.map((t) => `"${t}"`).join(", ")}]`);
	console.log("");
}

// ---- CLI (only when run directly, not when imported by new-photo) ----
const invokedDirectly =
	process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
	const arg = process.argv[2];
	if (!arg) {
		console.error("Usage: yarn suggest-tags <slug>");
		console.error("       yarn suggest-tags --all");
		process.exit(1);
	}

	const allSlugs = [
		...new Set(
			PHOTO_DIRS.flatMap((base) =>
				existsSync(base)
					? readdirSync(base, { withFileTypes: true })
							.filter((d) => d.isDirectory())
							.map((d) => d.name)
					: [],
			),
		),
	];

	const targets = arg === "--all" ? allSlugs : [arg];
	for (const slug of targets) {
		if (!allSlugs.includes(slug)) {
			console.error(`  ✗ "${slug}" — no folder found in archive/ or live.`);
			continue;
		}
		try {
			await suggestForSlug(slug);
		} catch (err) {
			console.error(`  ✗ ${slug}: ${err.message}`);
		}
	}

	console.log("Done. Object tags are concrete subjects; mine the caption for");
	console.log("mood/abstract tags. You decide what stays.");
}
