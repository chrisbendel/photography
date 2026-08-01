// Shared plumbing for the photo CLI scripts.
import { existsSync, readdirSync, readFileSync } from "node:fs";

export const LIVE_DIR = "src/content/photos";

export const ID_RE = /^[0-9a-f]{6}$/;

// yarn forwards a bare `--` as an argument where npm eats it.
export function cliArgs() {
	return process.argv.slice(2).filter((a) => a !== "--");
}

export function idsIn(dir) {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name);
}

// `get(key)` over a file's frontmatter, or null. Regex, not YAML: flat scalars only.
export function frontmatter(mdPath) {
	if (!existsSync(mdPath)) return null;
	const match = readFileSync(mdPath, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) return null;
	return (key) => {
		// `[ \t]*` not `\s*`: `\s` eats the newline and captures the next line.
		const m = match[1].match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"));
		return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
	};
}
