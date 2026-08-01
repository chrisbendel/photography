#!/usr/bin/env node
// The gate before merging. Catches what the build won't: git bloat, empty alt,
// a series typo quietly founding a new series. Missing/malformed frontmatter is
// the schema's job — `astro build` errors on that.
//
// Errors exit non-zero, warnings don't. Empty alt is an error because nothing
// else stops a half-written entry from shipping — there is no publish step.
import { readdirSync, statSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { frontmatter, ID_RE, idsIn, LIVE_DIR } from "./lib/entries.mjs";

const MAX_MB = 3;
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".avif"];
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

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

const seriesCounts = new Map();
const ids = idsIn(LIVE_DIR);
console.log(`Checking ${ids.length} photo entries in ${LIVE_DIR}/\n`);

for (const id of ids) {
	if (!ID_RE.test(id)) warn(`${id}/: not a 6-char hex hash`);

	const photoDir = join(LIVE_DIR, id);
	const get = frontmatter(join(photoDir, "index.md"));
	if (!get) continue;

	// `alt: ""` satisfies the schema but fails a screen reader.
	if (!get("alt")) fail(`${id}: empty alt text — not ready to ship`);

	// A series slug becomes a URL, so it has to look like one.
	const series = get("series");
	if (series && !SLUG_RE.test(series)) {
		fail(`${id}: series "${series}" isn't a lowercase kebab-case slug`);
	}
	if (series) seriesCounts.set(series, (seriesCounts.get(series) ?? 0) + 1);

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

// Series are derived from whatever photos name, so a typo can't dangle — it
// quietly founds a new series instead. A typo is nearly always a near-miss of a
// name that already exists ("wintr" for "winter"), while a genuinely new series
// looks nothing like the others. So: flag pairs that are one or two edits apart.
function editDistance(a, b) {
	let prev = [...Array(b.length + 1).keys()];
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		for (let j = 1; j <= b.length; j++) {
			row[j] = Math.min(
				prev[j] + 1,
				row[j - 1] + 1,
				prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
		}
		prev = row;
	}
	return prev[b.length];
}

const slugs = [...seriesCounts.keys()].sort();
for (let i = 0; i < slugs.length; i++) {
	for (let j = i + 1; j < slugs.length; j++) {
		// `winter-2025` and `winter-2026` are a deliberate pair, not a slip:
		// identical once the digits come out.
		const digitless = (s) => s.replace(/\d/g, "");
		if (digitless(slugs[i]) === digitless(slugs[j])) continue;

		const distance = editDistance(slugs[i], slugs[j]);
		// Scale the threshold: two edits apart means little between short names.
		if (distance <= (Math.min(slugs[i].length, slugs[j].length) >= 6 ? 2 : 1)) {
			warn(
				`series "${slugs[i]}" (${seriesCounts.get(slugs[i])}) and "${slugs[j]}" ` +
					`(${seriesCounts.get(slugs[j])}) differ by ${distance} character${distance === 1 ? "" : "s"} — typo?`,
			);
		}
	}
}

if (seriesCounts.size > 0) {
	console.log("\nSeries:");
	for (const slug of slugs) {
		const count = seriesCounts.get(slug);
		console.log(`  ${slug} — ${count} print${count === 1 ? "" : "s"}`);
	}
}

if (errors === 0 && warnings === 0) console.log("\n✓ All photos pass.");
else console.log(`\n${errors} error(s), ${warnings} warning(s).`);
process.exit(errors > 0 ? 1 : 0);
