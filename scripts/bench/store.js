// What the bench knows, and the one way it talks to the server. No DOM here.

export const bench = {
	// What the server last sent: every entry, and the vocabulary drawn from them.
	state: { entries: [], vocab: {} },
	current: null,
	// Which place is showing. "todo" is what came in and isn't done; "sheet" is
	// every other frame; "series" groups them. Only show() and a new roll change it.
	place: "sheet",
	// The field the Sheet is narrowed to frames missing, or null for all of them.
	gap: null,
	// How To do and Sheet lay out their frames: "strip", under the print, or
	// "grid", a contact sheet in its place. Kept: it is a way of working.
	layout: load("layout", "strip"),
	// The series open in the Series place. It may name one with no frames: a
	// series exists only once a photo names it, so a new one waits here till then.
	series: null,
	// To do in roll order, and the model's readings of frames not yet opened.
	// Both survive a reload: twenty frames is an evening.
	todo: load("todo", []),
	suggested: load("suggested", {}),
	// Files dropped together, waiting on the fields they share.
	pending: [],
	// Frames waiting on the vision model, including the one it is reading.
	unread: new Set(),
	// Twelve fields of typing are worth one confirm. Set by hand as well as by
	// the input event, because chips and pickers change values from script.
	dirty: false,
};

function load(key, fallback) {
	try {
		const value = JSON.parse(localStorage.getItem(key));
		if (value !== null && typeof value === typeof fallback && Array.isArray(value) === Array.isArray(fallback)) {
			return value;
		}
	} catch (_) {}
	return fallback;
}

function keep(key, value) {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch (_) {}
}

export function setLayout(layout) {
	bench.layout = layout;
	keep("layout", layout);
}

export function setTodo(ids) {
	bench.todo = ids;
	keep("todo", ids);
}

export function suggest(id, reading) {
	bench.suggested[id] = reading;
	keep("suggested", bench.suggested);
}

export function takeSuggestion(id) {
	const reading = bench.suggested[id];
	if (reading) {
		delete bench.suggested[id];
		keep("suggested", bench.suggested);
	}
	return reading;
}

export const byId = (id) => bench.state.entries.find((entry) => entry.id === id);

// What a finished frame has. Caption and notes are left out, since blank is a
// fine answer for both, and series is left out because it has its own place.
export const GAPS = ["alt", "year", "format", "lens", "film", "location", "tags"];
export const lacks = (entry, field) =>
	field === "tags" ? !entry.tags.length : !String(entry[field] ?? "").trim();

// ---------- Series ----------
// Built the way the site builds them (src/lib/series.ts), so the bench shows the
// order /series/ will: by title, and members by year, then by added.

export const titleOf = (slug) =>
	slug
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");

// The same slug the server writes: keep in step with sanitise() in bench.mjs.
export const slugify = (name) =>
	name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

function byCapture(a, b) {
	const ay = Number.parseInt(a.year, 10);
	const by = Number.parseInt(b.year, 10);
	if (ay && by && ay !== by) return by - ay;
	return b.added.localeCompare(a.added);
}

export function seriesList() {
	const groups = new Map();
	for (const entry of bench.state.entries) {
		if (!entry.series) continue;
		if (!groups.has(entry.series)) groups.set(entry.series, []);
		groups.get(entry.series).push(entry);
	}
	return [...groups]
		.map(([slug, members]) => ({ slug, ids: members.sort(byCapture).map((entry) => entry.id) }))
		.sort((a, b) => titleOf(a.slug).localeCompare(titleOf(b.slug)));
}

// Frames deleted, here or by hand, drop out of everything kept for them.
export function prune() {
	const live = new Set(bench.state.entries.map((entry) => entry.id));
	if (bench.todo.some((id) => !live.has(id))) setTodo(bench.todo.filter((id) => live.has(id)));
	for (const id of Object.keys(bench.suggested)) if (!live.has(id)) takeSuggestion(id);
	for (const id of bench.unread) if (!live.has(id)) bench.unread.delete(id);
}

// What the main button does for whatever is open. One answer, read by the label,
// the submit handler and ⌘S, so they can't disagree.
export function action() {
	if (bench.pending.length) return "add";
	if (!bench.current) return null;
	return bench.todo.includes(bench.current) ? "done" : "save";
}

// Every write is JSON: bench.mjs refuses anything else, which is what stops a
// page on another origin posting here without a preflight it will never get.
export async function api(path, method = "GET", body = {}) {
	const options =
		method === "GET"
			? {}
			: { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
	const res = await fetch(path, options);
	const json = await res.json();
	if (!res.ok) throw new Error(json.error ?? res.statusText);
	return json;
}
