#!/usr/bin/env node
// Local tag suggestions (Florence-2 via transformers.js) — no API, offline
// after the first download. Suggestions only, never written to frontmatter.
// Usage: yarn suggest-tags <slug>|--all. Env: TAGGER_MODEL, TAGGER_DTYPE, TAGGER_MAX.
//
// Three captions at rising detail, ranked by how many agree: the terse one names
// the subject, the longest wanders into composition. <OD> is unused — COCO-trained,
// so on landscapes it returns noise (one hallucinated "bird" on the first photo).

import { existsSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
	Florence2ForConditionalGeneration,
	AutoProcessor,
	RawImage,
} from "@huggingface/transformers";
import { cliArgs, frontmatter, idsIn, LIVE_DIR } from "./lib/entries.mjs";

// Large at q8 beats base at fp32: smaller (821 MB vs 1.0 GB) and reads
// black-and-white correctly where base guesses. ~3s more per photo.
const MODEL = process.env.TAGGER_MODEL || "onnx-community/Florence-2-large";
const DTYPE = process.env.TAGGER_DTYPE || "q8";
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
		"small large tall short thin wide narrow several many some most other " +
		"another each both left right middle top bottom edge corner distance body " +
		"few lot bit whole entire rest side sides part parts piece area areas " +
		"group groups bunch collection pair variety number amount range " +
		"surface surfaces scattered arranged formation formations covering " +
		"covered visible object objects horizon texture textured layer " +
		"man woman people person background foreground front side scene shot center").split(
			" ",
		),
);

// Mood and light words earn their place from a single mention.
const MOOD = new Set(
	("calm still quiet peaceful serene stark bleak soft harsh bright dark moody " +
		"misty foggy hazy overcast stormy golden empty desolate lonely wintry " +
		"barren rugged windswept glassy shadowed sunlit").split(" "),
);

const CAPTION_TASKS = ["<CAPTION>", "<DETAILED_CAPTION>", "<MORE_DETAILED_CAPTION>"];
const MAX_TAGS = Number(process.env.TAGGER_MAX) || 7;

export function findImage(slug) {
	const dir = join(LIVE_DIR, slug);
	if (!existsSync(dir)) return null;
	const img = readdirSync(dir).find(
		(f) => f.startsWith("image.") && IMAGE_EXTS.includes(extname(f).toLowerCase()),
	);
	return img ? join(dir, img) : null;
}

// Hyphens split: "snow-covered" gives "snow" (real) and "covered" (stopped).
function words(text) {
	return text
		.toLowerCase()
		.replace(/[^a-z\s-]/g, " ")
		.split(/[\s-]+/)
		.filter((w) => w.length > 2 && !STOP.has(w));
}

// Tags already used on the site — the vocabulary that improves as it grows.
function corpusTags() {
	const tags = new Set();
	for (const id of idsIn(LIVE_DIR)) {
		const raw = frontmatter(join(LIVE_DIR, id, "index.md"))?.("tags") ?? "";
		for (const t of raw.replace(/[[\]]/g, "").split(",")) {
			const tag = t.trim().replace(/^["']|["']$/g, "");
			if (tag) tags.add(tag);
		}
	}
	return tags;
}

// Match against existing series only — a wrong guess would found a real one.
export function suggestSeries(tags, minOverlap = 2) {
	const candidates = new Set();
	for (const id of idsIn(LIVE_DIR)) {
		const s = frontmatter(join(LIVE_DIR, id, "index.md"))?.("series");
		if (s) candidates.add(s);
	}

	let best = { slug: "", score: 0 };
	for (const slug of candidates) {
		const vocabulary = new Set(words(slug.replace(/-/g, " ")));
		for (const id of idsIn(LIVE_DIR)) {
			const photo = frontmatter(join(LIVE_DIR, id, "index.md"));
			if (photo?.("series") !== slug) continue;
			for (const t of (photo("tags") ?? "").replace(/[[\]]/g, "").split(",")) {
				const tag = t.trim().replace(/^["']|["']$/g, "");
				if (tag) vocabulary.add(tag);
			}
		}

		const score = tags.filter((t) => vocabulary.has(t)).length;
		if (score > best.score) best = { slug, score };
	}

	return best.score >= minOverlap ? best.slug : "";
}

// Fold onto an established tag by plural — `/tags/tree/` vs `/tags/trees/`.
function canonical(word, corpus) {
	if (corpus.has(word)) return word;
	for (const variant of [`${word}s`, word.replace(/s$/, "")]) {
		if (variant !== word && corpus.has(variant)) return variant;
	}
	return word;
}

// Alt from the middle caption: the terse one is too thin, the longest is a
// paragraph. Strip the model's "the image is a black and white photo of" opener —
// a screen reader already says "image", and the catalogue is all monochrome — and
// keep one sentence. The full description lives in `scene`.
function deriveAlt(text) {
	let s = (text || "")
		.trim()
		.replace(/^the image (shows|is|depicts)\s+/i, "")
		.replace(/^(a|an)\s+(black and white\s+)?(photo(graph)?|picture|image)\s+of\s+/i, "")
		.replace(/^(black and white\s+)?(photo(graph)?|picture|image)\s+of\s+/i, "");
	s = s.split(/(?<=\.)\s+/)[0].replace(/\s*\.\s*$/, "");
	return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

// Caption agreement is the signal, frequency the tiebreak; gerunds penalised.
function rank(captions, corpus) {
	const stats = new Map();
	for (const text of captions) {
		const seen = new Set();
		for (const raw of words(text)) {
			const w = canonical(raw, corpus);
			const s = stats.get(w) ?? { count: 0, captions: 0 };
			s.count++;
			if (!seen.has(w)) {
				s.captions++;
				seen.add(w);
			}
			stats.set(w, s);
		}
	}

	return [...stats.entries()]
		.map(([w, s]) => {
			let score = s.captions * 2 + s.count + (MOOD.has(w) ? 2 : 0);
			if (corpus.has(w)) score += 3;
			if (w.endsWith("ing")) score -= 2;
			return { tag: w, score };
		})
		.sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag))
		.slice(0, MAX_TAGS)
		.map((r) => r.tag);
}

// Loaded once, reused across every photo in a run.
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
	// 128 truncates the large model mid-sentence, losing the closing mood clause.
	const ids = await model.generate({ ...inputs, max_new_tokens: 256 });
	const text = processor.batch_decode(ids, { skip_special_tokens: false })[0];
	return processor.post_process_generation(text, task, image.size);
}

export async function tagImage(imagePath) {
	const image = await RawImage.read(imagePath);
	const captions = [];
	for (const task of CAPTION_TASKS) {
		const out = await runTask(image, task);
		captions.push((out[task] ?? "").trim());
	}
	return {
		caption: captions[captions.length - 1],
		alt: deriveAlt(captions[1] ?? captions[0]),
		tags: rank(captions, corpusTags()),
	};
}

async function suggestForSlug(slug) {
	const imagePath = findImage(slug);
	if (!imagePath) {
		console.error(`  ✗ No image found for "${slug}".`);
		return;
	}
	process.stdout.write(`  ${slug} ... `);
	const { caption, alt, tags } = await tagImage(imagePath);
	console.log("done");
	console.log(`    alt: ${alt}`);
	console.log(`    caption: ${caption}`);
	console.log(`    tags: ${tags.join(", ")}`);
	console.log("");
}

// CLI — only when run directly, not when photo.mjs imports tagImage.
const invokedDirectly =
	process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
	const [arg] = cliArgs();
	if (!arg) {
		console.error("Usage: yarn suggest-tags <slug>");
		console.error("       yarn suggest-tags --all");
		process.exit(1);
	}

	const allSlugs = idsIn(LIVE_DIR);

	const targets = arg === "--all" ? allSlugs : [arg];
	for (const slug of targets) {
		if (!allSlugs.includes(slug)) {
			console.error(`  ✗ "${slug}" — no folder in ${LIVE_DIR}/.`);
			continue;
		}
		try {
			await suggestForSlug(slug);
		} catch (err) {
			console.error(`  ✗ ${slug}: ${err.message}`);
		}
	}

	console.log("Done. Read the caption for anything the tags missed.");
	console.log("You decide what a photograph means.");
}
