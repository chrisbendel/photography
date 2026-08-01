#!/usr/bin/env node
// Pre-merge gate for what the build won't catch. Errors exit non-zero, warnings don't.
import { readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { frontmatter, ID_RE, idsIn, LIVE_DIR } from "./lib/entries.mjs";

const MAX_MB = 3;
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".avif"];

let errors = 0;
let warnings = 0;
const fail = (msg) => {
	console.log(`  ✗ ${msg}`);
	errors++;
};
const warn = (msg) => {
	console.log(`  ⚠ ${msg}`);
	warnings++;
};

const ids = idsIn(LIVE_DIR);
console.log(`Checking ${ids.length} photo entries in ${LIVE_DIR}/\n`);

for (const id of ids) {
	if (!ID_RE.test(id)) warn(`${id}/: not a 6-char hex hash`);

	const photoDir = join(LIVE_DIR, id);
	const get = frontmatter(join(photoDir, "index.md"));
	if (!get) continue;

	// `alt: ""` satisfies the schema but fails a screen reader.
	if (!get("alt")) fail(`${id}: empty alt text — not ready to ship`);

	const image = get("image").replace(/^\.\//, "");
	for (const file of readdirSync(photoDir)) {
		if (!IMAGE_EXTS.includes(extname(file).toLowerCase())) continue;
		if (file !== image) {
			warn(`${id}/${file}: orphan image, frontmatter references ${image || "(none)"}`);
			continue;
		}
		const mb = statSync(join(photoDir, file)).size / 1024 / 1024;
		if (mb > MAX_MB) warn(`${id}: ${mb.toFixed(1)} MB > ${MAX_MB} MB — re-export smaller`);
	}
}

if (errors === 0 && warnings === 0) console.log("\n✓ All photos pass.");
else console.log(`\n${errors} error(s), ${warnings} warning(s).`);
process.exit(errors > 0 ? 1 : 0);
