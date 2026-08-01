// Shared plumbing for the photo CLI scripts.
import { existsSync, readdirSync, readFileSync } from "node:fs";

export const LIVE_DIR = "src/content/photos";

export const ID_RE = /^[0-9a-f]{6}$/;

// yarn forwards a bare `--` as an argument where npm eats it, so
// `yarn photo -- scan.jpg` and `yarn photo scan.jpg` both have to work.
export function cliArgs() {
	return process.argv.slice(2).filter((a) => a !== "--");
}

// Each photo is a folder named by its id.
export function idsIn(dir) {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name);
}

// A `get(key)` reader over a file's frontmatter, or null if there is none.
// Regex, not a YAML parser: these scripts only read flat scalars.
export function frontmatter(mdPath) {
	if (!existsSync(mdPath)) return null;
	const match = readFileSync(mdPath, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) return null;
	return (key) => {
		// `[ \t]*`, not `\s*` — `\s` matches newlines, so on a blank field it
		// swallows the line break and captures the next line's value instead.
		const m = match[1].match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"));
		return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
	};
}
