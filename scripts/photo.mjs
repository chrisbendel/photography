#!/usr/bin/env node
// Scaffold a new entry, live immediately. Usage: yarn photo <image> [--no-tags]
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { cliArgs, entryTemplate, LIVE_DIR, newId, TAGGABLE_EXTS } from "./lib/entries.mjs";
import { tagImage } from "./suggest-tags.mjs";

const args = cliArgs();
const skipTags = args.includes("--no-tags");
const [imagePath] = args.filter((a) => !a.startsWith("--"));

mkdirSync(LIVE_DIR, { recursive: true });

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
	if (!TAGGABLE_EXTS.includes(ext)) {
		console.log(`Skipping tag suggestions — ${ext} not supported (use jpg/png/webp).`);
	} else {
		try {
			console.log("Suggesting tags (local vision model) ...");
			const { caption, alt: suggestedAlt, tags } = await tagImage(copiedImage);
			// Kept, not just shown: it finds a photo by what you never tagged.
			scene = caption;
			// Written, not suggested: a blank alt is an accessibility bug.
			alt = suggestedAlt;
			tagComment = `# suggested — move keepers into tags: ${tags.join(", ")}\n`;
			console.log(`  alt:       ${alt}`);
			console.log(`  suggested: ${tags.join(", ")}`);

			// Never guessed — scoring by shared tags picked the largest series. AGENTS.md.
			console.log("  series:    (blank — name one to join or start it)");
		} catch (err) {
			console.log(`  (tag suggestion failed: ${err.message})`);
		}
	}
}

// Shared with the bench (form.mjs), so the two can't drift on a fresh entry.
const mdPath = join(photoDir, "index.md");
writeFileSync(
	mdPath,
	entryTemplate({
		added: new Date().toISOString().slice(0, 10),
		imageRef,
		alt,
		series,
		tagComment,
		scene,
	}),
);

const entry = resolve(mdPath);

console.log(`Created  ${entry}`);
console.log(`         ${imageNote}`);
console.log("Preview: yarn dev, then yarn check-photos before pushing.");

// $VISUAL/$EDITOR first — the shell already knows which editor you meant.
const editor = process.env.VISUAL || process.env.EDITOR || "code";

// VS Code has no CLI option for editor groups (1.130), so both open as tabs and
// ⌘\ splits them. A terminal editor gets the entry alone — vim has no use for a jpg.
const isCode = /^(code|code-insiders|codium|vscodium|cursor|windsurf)$/.test(basename(editor));
const openWith = isCode && copiedImage ? [entry, resolve(copiedImage)] : [entry];

// Piped, CI, an agent: nobody there to press anything, so print and leave.
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
	// Inherited stdio: a terminal editor takes the tty; `code` returns at once.
	const child = spawn(editor, openWith, { stdio: "inherit" });
	child.on("error", (err) => {
		console.log(`Couldn't launch ${editor} (${err.code}). Open it yourself:`);
		console.log(`         ${entry}`);
	});
	if (openWith.length > 1) {
		console.log("Split:   entry and photo are both open — ⌘\\ puts them side by side.");
	}
});
