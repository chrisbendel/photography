#!/usr/bin/env node
// Reverse of publish: move a photo from src/content/photos/ back to archive/.
// Usage: yarn unpublish <id>
import { existsSync, readdirSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";

// A bare `--` is dropped: yarn passes it through where npm eats it.
const [id] = process.argv.slice(2).filter((a) => a !== "--");

const liveDir = "src/content/photos";

function liveIds() {
	if (!existsSync(liveDir)) return [];
	return readdirSync(liveDir, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name);
}

if (!id) {
	console.error("Usage: yarn unpublish <id>");
	const ids = liveIds();
	console.error(ids.length === 0 ? "  Nothing published." : `  Published: ${ids.join(", ")}`);
	process.exit(1);
}

const livePath = join(liveDir, id);
const archivePath = join("archive", id);

if (!existsSync(livePath)) {
	console.error(`Not published: ${livePath}`);
	const ids = liveIds();
	console.error(ids.length === 0 ? "Nothing published." : `Published: ${ids.join(", ")}`);
	process.exit(1);
}

if (existsSync(archivePath)) {
	console.error(`Already in archive: ${archivePath} — move or delete it first.`);
	process.exit(1);
}

// Read the series before moving, to flag one left with no photos.
const md = existsSync(join(livePath, "index.md"))
	? readFileSync(join(livePath, "index.md"), "utf8")
	: "";
const seriesMatch = md.match(/^series:\s*(.*)$/m);
const series = seriesMatch ? seriesMatch[1].trim().replace(/^["']|["']$/g, "") : "";

renameSync(livePath, archivePath);
console.log(`Unpublished ${id}: ${livePath} → ${archivePath}`);

// `publish` may have scaffolded the series file. Don't delete it — an empty
// series is valid — but say so, since it renders as an empty series page.
if (series) {
	const stillUsed = liveIds().some((other) => {
		const otherMd = join(liveDir, other, "index.md");
		return existsSync(otherMd) && new RegExp(`^series:\\s*["']?${series}["']?\\s*$`, "m").test(readFileSync(otherMd, "utf8"));
	});
	if (!stillUsed) {
		console.log(`Note: series "${series}" now has no published photos (src/content/series/${series}.md).`);
	}
}
