#!/usr/bin/env node
// Put something human-readable next to each hash id. Usage: yarn entries
import { join } from "node:path";
import { frontmatter, idsIn, LIVE_DIR } from "./lib/entries.mjs";

function describe(id) {
	const get = frontmatter(join(LIVE_DIR, id, "index.md"));
	if (!get) return { added: "", line: "(no index.md)" };

	// Before alt is filled in, the scan filename is the only handle there is.
	const scan = get("# scan");
	const label = get("caption") || get("alt") || (scan ? `[${scan}]` : "(unfilled)");
	const added = get("added");
	const rest = [get("location"), get("year") || added, get("series")].filter(Boolean);
	return { added, line: [label, ...rest].join("  ·  ") };
}

const rows = idsIn(LIVE_DIR)
	.map((id) => ({ id, ...describe(id) }))
	.sort((a, b) => b.added.localeCompare(a.added) || a.id.localeCompare(b.id));

console.log(`\n${rows.length} photo${rows.length === 1 ? "" : "s"}`);
for (const { id, line } of rows) console.log(`  ${id}  ${line}`);
console.log("");
