#!/usr/bin/env node
// Scaffold a new entry, live immediately. Usage: yarn photo <image> [--no-tags]
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
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
}

// Comments only, never `tags:`. A failure here must not lose the scaffold.
let tagComment = "";
let series = "";
let scene = "";
let alt = "";
if (copiedImage && !skipTags) {
	const ext = extname(copiedImage).toLowerCase();
	if (!TAGGABLE.includes(ext)) {
		console.log(`Skipping tag suggestions — ${ext} not supported (use jpg/png/webp).`);
	} else {
		try {
			console.log("Suggesting tags (local vision model) ...");
			const { caption, alt: suggestedAlt, tags } = await tagImage(copiedImage);
			// `scene` is kept, not just shown: it is what makes search find a photo
			// by something you never got round to tagging.
			scene = caption;
			// Alt is written, not suggested — a blank one is an accessibility bug,
			// and a machine sentence beats the empty string you meant to come back to.
			alt = suggestedAlt;
			tagComment = `# suggested — move keepers into tags: ${tags.join(", ")}\n`;
			console.log(`  alt:       ${alt}`);
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
// The comments are for the person filling them in, so only the non-obvious ones
// get one; `lens`/`film`/`location` explain themselves.
const mdPath = join(photoDir, "index.md");
writeFileSync(
	mdPath,
	`---
# Stamped at scaffold. Orders the gallery, newest first. Leave it alone.
added: ${new Date().toISOString().slice(0, 10)}
year:
image: ${imageRef}
# Required. Written for you from the image — skim it, it is what a screen reader says.
alt: ${JSON.stringify(alt)}
# One short line printed under the image. Optional.
caption: ""
lens: ""
film: ""
location: ""
# Written with × when shown, so type it plainly: 4x5, 6x7, 35mm.
format: ""
# A slug. Naming one that doesn't exist yet is how you start it.
series: ${series}
# Lowercase search terms, any number including none. Not routes.
${tagComment}tags: []
# What the vision model saw. Feeds search, never displayed. Machine-written.
scene: ${JSON.stringify(scene)}
# What you saw, what you decided, what you'd do differently. Plain text.
notes: ""
---

`.replace(/ +$/gm, ""),
);

const entry = resolve(mdPath);

console.log(`Created  ${entry}`);
console.log(`         ${imageNote}`);
console.log("Preview: yarn dev, then yarn check-photos before pushing.");

// $VISUAL/$EDITOR first — the shell already knows which editor you meant, and
// hardcoding `code` breaks for anyone who doesn't use it.
const editor = process.env.VISUAL || process.env.EDITOR || "code";

// VS Code has no CLI option for editor groups — 1.130 offers --diff, --goto and
// --reuse-window and nothing that opens a file beside another — so the best a
// script can do is put both files in the window as tabs; ⌘\ then splits them.
// A terminal editor gets the entry alone: vim has no use for a jpg.
const isCode = /^(code|code-insiders|codium|vscodium|cursor|windsurf)$/.test(basename(editor));
const openWith = isCode && copiedImage ? [entry, resolve(copiedImage)] : [entry];

// Not a terminal (piped, CI, an agent running this) means no one is there to
// press anything, so print the command and leave.
if (!process.stdin.isTTY) {
	console.log(`\nOpen:    ${editor} ${openWith.join(" ")}`);
	process.exit(0);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.question(`\nEnter to open in ${editor}, anything else to skip: `, (answer) => {
	rl.close();
	if (answer.trim() !== "") {
		console.log(`Open:    ${editor} ${openWith.join(" ")}`);
		return;
	}
	// stdio inherited so a terminal editor takes the tty and this waits for it;
	// `code` and friends hand off to the running window and return immediately.
	const child = spawn(editor, openWith, { stdio: "inherit" });
	child.on("error", (err) => {
		console.log(`Couldn't launch ${editor} (${err.code}). Open it yourself:`);
		console.log(`         ${entry}`);
	});
	if (openWith.length > 1) {
		console.log("Split:   entry and photo are both open — ⌘\\ puts them side by side.");
	}
});
