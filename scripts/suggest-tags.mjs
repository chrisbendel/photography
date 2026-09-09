#!/usr/bin/env node
// Local tag suggestions (Florence-2 via transformers.js) — no API, offline after
// the first download. Suggestions only, never written to frontmatter.
// Usage: yarn suggest-tags <slug>|--all. Env: TAGGER_MODEL, TAGGER_DTYPE, TAGGER_MAX.
//
// Three captions at rising detail, ranked by how many agree. <OD> is unused —
// COCO-trained, so on landscapes it returns noise (a hallucinated "bird").
// Mood and season are stripped, not scored; AGENTS.md has the measurements.

import { existsSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
	Florence2ForConditionalGeneration,
	AutoProcessor,
	RawImage,
} from "@huggingface/transformers";
import { cliArgs, frontmatter, idsIn, LIVE_DIR, TAGGABLE_EXTS } from "./lib/entries.mjs";

// Large at q8 beats base at fp32: smaller (821 MB vs 1.0 GB) and reads
// black-and-white correctly where base guesses. ~3s more per photo.
const MODEL = process.env.TAGGER_MODEL || "onnx-community/Florence-2-large";
const DTYPE = process.env.TAGGER_DTYPE || "q8";

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
		"man woman people person background foreground front side scene shot center " +
		// Left behind once the framing and mood sentences are cut.
		"angle taken appear either ones beautiful").split(" "),
);

// Never suggested, whatever the captions agree on. In monochrome the model reads
// any smooth bright region as snow or ice: it called a long-exposure river a
// "frozen lake" in all three captions (fc75e1), so caption agreement cannot tell
// the two apart. A season is yours to type — it is one word, and it is true.
const CLIMATE = new Set(
	("snow snowy snowfall snowing ice icy iced frost frosty frozen freeze " +
		"fog foggy mist misty haze hazy rain rainy").split(" "),
);

// Longest first, so "snowfall" is not half-matched by "snow".
const CLIMATE_RE = [...CLIMATE].sort((a, b) => b.length - a.length).join("|");

const CAPTION_TASKS = ["<CAPTION>", "<DETAILED_CAPTION>", "<MORE_DETAILED_CAPTION>"];
const MAX_TAGS = Number(process.env.TAGGER_MAX) || 7;
const FLOOR = Number(process.env.TAGGER_FLOOR) || 6;

export function findImage(slug) {
	const dir = join(LIVE_DIR, slug);
	if (!existsSync(dir)) return null;
	const img = readdirSync(dir).find(
		(f) => f.startsWith("image.") && TAGGABLE_EXTS.includes(extname(f).toLowerCase()),
	);
	return img ? join(dir, img) : null;
}

// The mood verdict and the camera-position sentence are boilerplate: "peaceful
// and serene" landed on 11 of 13 frames, so it separates none of them. Cut here,
// so it reaches neither the ranking nor `scene`. Descriptive use survives.
function frame(text) {
	return (text || "")
		.replace(/,?\s*(and\s+)?the overall (mood|atmosphere|feeling|tone)\b[^.]*\.?/gi, ".")
		.replace(/[^.]*\bis (taken|shot|photographed) from\b[^.]*\.?/gi, "")
		.replace(/,?\s*(and\s+)?(with|creating)\s+a\s+sense\s+of\b[^.]*/gi, "")
		.replace(/,?\s*creating a\b[^.]*?\bcontrast\b[^.]*/gi, "")
		.replace(/\s*\.\s*\./g, ".")
		.replace(/\s{2,}/g, " ")
		.trim();
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

// Fold onto an established tag by plural: one subject, one search term.
function canonical(word, corpus) {
	if (corpus.has(word)) return word;
	for (const variant of [`${word}s`, word.replace(/s$/, "")]) {
		if (variant !== word && corpus.has(variant)) return variant;
	}
	return word;
}

// Alt from the middle caption: the terse one is too thin, the longest is a
// paragraph. The opener goes (a screen reader already says "image") and one
// sentence is kept; `scene` holds the rest.
//
// CLIMATE matters more here than in the tags, because `alt` is written to the
// file and read by the one person who can't check it: "A frozen lake with water
// flowing over rocks" (fc75e1) is a river with no ice on it.
function deriveAlt(text) {
	let s = (text || "")
		.trim()
		.replace(/^the image (shows|is|depicts)\s+/i, "")
		.replace(/^(a|an)\s+(black and white\s+)?(photo(graph)?|picture|image)\s+of\s+/i, "")
		.replace(/^(black and white\s+)?(photo(graph)?|picture|image)\s+of\s+/i, "");
	s = s.split(/(?<=\.)\s+/)[0].replace(/\s*\.\s*$/, "");
	s = s
		// A whole clause claiming a season goes; the main clause never does.
		.replace(new RegExp(`,[^,]*\\b(${CLIMATE_RE})\\b[^,]*`, "gi"), "")
		// "snow-covered rocks" has to lose both words, or "covered" dangles.
		.replace(new RegExp(`\\b(${CLIMATE_RE})[-\\s]covered\\s*`, "gi"), "")
		.replace(new RegExp(`\\b(${CLIMATE_RE})\\b\\s*`, "gi"), "")
		.replace(/\s{2,}/g, " ")
		.replace(/\s+([,.])/g, "$1")
		.replace(/[\s,]+$/, "")
		.trim();
	return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

// Caption agreement is the signal, frequency the tiebreak; gerunds penalised.
// Below FLOOR a word came from one caption and isn't already a site tag, so it
// is dropped rather than padding the list. Raise the floor before widening STOP.
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
		.filter(([w]) => !CLIMATE.has(w))
		.map(([w, s]) => {
			let score = s.captions * 2 + s.count;
			if (corpus.has(w)) score += 3;
			if (w.endsWith("ing")) score -= 2;
			return { tag: w, score };
		})
		.filter((r) => r.score >= FLOOR)
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
		captions.push(frame((out[task] ?? "").trim()));
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
