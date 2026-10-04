// Draws everything around the form from `bench`: the places, the stage, the
// strip, and the Series place whole. Never the form's fields — select() fills
// those once, so typing survives a redraw.
import { action, api, bench, byId, GAPS, lacks, prune, seriesList, titleOf } from "./store.js";

export const $ = (sel) => document.querySelector(sel);
export const form = $("#entry");
const frames = $("#frames");

// Each place has its own status line; only the showing one is visible.
export const say = (message) => {
	for (const line of document.querySelectorAll(".status")) line.textContent = message;
};

export function refresh(next) {
	bench.state = next;
	prune();
	draw();
}

// Writing one frame's fields; the server sends the whole state back.
export async function patch(id, fields) {
	refresh(await api(`/api/entries/${id}`, "PATCH", { fields }));
}

export const thumbUrl = (id, width) => `/thumb/${id}?w=${width}`;

function thumb(id, width) {
	const img = document.createElement("img");
	img.loading = "lazy";
	img.src = thumbUrl(id, width);
	img.alt = byId(id)?.alt || id;
	return img;
}

// The same fields the site's search reads (src/pages/index.astro), plus the id.
export const haystack = (entry) =>
	[
		entry.id,
		entry.caption,
		entry.alt,
		entry.location,
		entry.lens,
		entry.film,
		entry.format,
		entry.series,
		entry.year,
		entry.notes,
		entry.scene,
	]
		.concat(entry.tags)
		.join(" ")
		.toLowerCase();

const query = (input) => $(input).value.trim().toLowerCase();

const filed = () => bench.state.entries.filter((entry) => !bench.todo.includes(entry.id));

// The frame ids the strip shows: the roll in order, or the sheet newest first,
// narrowed by the filter and by a gap. The Series strip holds series, not frames.
export function ids() {
	const { todo, place, gap } = bench;
	if (place === "series") return [];
	if (place === "todo") return todo;
	const q = query("#filter");
	return filed()
		.filter((entry) => haystack(entry).includes(q) && (!gap || lacks(entry, gap)))
		.map((entry) => entry.id);
}

export function step(id, by) {
	const list = ids();
	return list[list.indexOf(id) + by] ?? null;
}

// Where to go once a frame leaves the strip: the one after it, else before.
export const neighbour = (id) => step(id, 1) ?? step(id, -1);

const LABELS = { add: () => `Add ${bench.pending.length} frames`, done: () => "Done", save: () => "Save" };
const PLACES = { todo: "To do", sheet: "Sheet", series: "Series" };

export function draw() {
	const { state, todo, place, pending, current, unread } = bench;
	const list = seriesList();

	// A drop is headed for To do, so that tab is lit while its fields are set.
	const lit = pending.length ? "todo" : place;
	const counts = { todo: todo.length, sheet: state.entries.length - todo.length, series: list.length };
	for (const [name, label] of Object.entries(PLACES)) {
		$(`#tab-${name}`).textContent = `${label} · ${counts[name]}`;
		$(`#tab-${name}`).setAttribute("aria-current", String(lit === name));
	}

	const reading = place === "todo" && unread.size > 0;
	$("#strip-label").textContent = reading ? `Reading ${unread.size}` : "";
	$("#strip-label").hidden = !reading;
	$("#filter").hidden = $("#gaps").hidden = place !== "sheet";
	$("#new-series").hidden = place !== "series";
	$("#layouts").hidden = place === "series";
	for (const button of $("#layouts").children) {
		button.setAttribute("aria-pressed", String(button.dataset.layout === bench.layout));
	}
	if (place === "sheet") drawGaps();

	// What the stage holds: a drop waiting on its fields, the Series place, the
	// frames as a grid, one frame, or nothing. The panel holds the batch's fields,
	// or the open frame's in any frame place.
	const stage = pending.length ? "batch" : place === "series" ? "series" : gridding() ? "grid" : current ? "print" : "empty";
	$("#batch").hidden = stage !== "batch";
	$("#strip").hidden = stage === "batch";
	$("#preview").hidden = stage !== "print";
	$("#grid").hidden = stage !== "grid";
	$("#frames").hidden = stage === "grid";
	$("#members").hidden = $("#picker").hidden = stage !== "series";
	form.hidden = !pending.length && (!current || stage === "series");
	form.toggleAttribute("data-batch", pending.length > 0);

	// An empty grid says the same as an empty stage, unless a filter emptied it,
	// which the grid says itself.
	const filtering = place === "sheet" && (query("#filter") || bench.gap);
	const blank = stage === "empty" || (stage === "grid" && !ids().length && !filtering);
	showEmpty(
		!blank
			? ""
			: place === "todo"
				? "Nothing to do. Drop scans anywhere to start a roll."
				: state.entries.length
					? "Pick a frame from the strip."
					: "No frames yet. Drop scans anywhere to start a roll.",
	);

	$("#save").textContent = LABELS[action()]?.() ?? "Save";
	$("#reread").disabled = !current || unread.has(current);

	if (stage === "series") drawSeries(list);
	drawStrip();
}

// The stage's one empty state, for every place; blank hides it.
function showEmpty(text) {
	$("#empty").textContent = text;
	$("#empty").hidden = !text;
}

// The grid is the strip laid out large on the stage: same frames, same order,
// same filter and gaps, drawn by the same code into a different container.
const gridding = () => bench.layout === "grid" && bench.place !== "series";

export function drawStrip() {
	if (bench.place === "series") {
		frames.replaceChildren(...openable(seriesList()).map(seriesCard));
		return keepInView(frames.querySelector('[aria-current="true"]'));
	}
	const into = gridding() ? $("#grid") : frames;
	const list = ids();
	into.replaceChildren(...list.map((id) => frameButton(id, gridding() ? 480 : 240)));
	if (!list.length && bench.place === "sheet" && (query("#filter") || bench.gap)) {
		into.append(verso("No frame matches."));
	}
	const open = into.querySelector('[aria-current="true"]');
	if (gridding()) open?.scrollIntoView({ block: "nearest" });
	else keepInView(open);
}

// One chip per field some saved frame is missing, with how many. A chip narrows
// the strip to those frames; filling the field moves each one out of it.
function drawGaps() {
	const sheet = filed();
	$("#gaps").replaceChildren(
		...GAPS.map((field) => [field, sheet.filter((entry) => lacks(entry, field)).length])
			.filter(([field, count]) => count || field === bench.gap)
			.map(([field, count]) => {
				const chip = document.createElement("button");
				chip.type = "button";
				chip.className = "quiet";
				chip.dataset.gap = field;
				chip.textContent = `no ${field} · ${count}`;
				chip.setAttribute("aria-pressed", String(field === bench.gap));
				return chip;
			}),
	);
}

// Clicks are handled once per container, in main.js, by these data attributes.
function frameButton(id, width) {
	const entry = byId(id);
	const frame = thumbButton(id, width);
	frame.dataset.id = id;
	frame.setAttribute("aria-current", String(id === bench.current));
	// A blank alt fails check-photos, so the strip says so.
	const state = bench.unread.has(id) ? "reading" : entry.alt ? "" : "no alt";
	if (state) frame.append(verso(state, state === "no alt" ? "gap" : ""));
	return frame;
}

// A strip-sized thumb on a button; no id gives a blank one, for a new series.
function thumbButton(id, width = 240) {
	const entry = id && byId(id);
	const button = document.createElement("button");
	button.className = "frame";
	button.type = "button";
	button.title = entry ? entry.caption || entry.alt || id : "";
	button.append(id ? thumb(id, width) : document.createElement("img"));
	return button;
}

function verso(text, extra = "") {
	const span = document.createElement("span");
	span.className = `verso ${extra}`.trim();
	span.textContent = text;
	return span;
}

// Sideways only, so nothing but the strip moves.
function keepInView(open) {
	if (!open) return;
	const strip = frames.getBoundingClientRect();
	const frame = open.getBoundingClientRect();
	if (frame.left < strip.left) frames.scrollLeft -= strip.left - frame.left;
	else if (frame.right > strip.right) frames.scrollLeft += frame.right - strip.right;
}

// ---------- Series ----------

function openable(list) {
	if (bench.series && !list.some((s) => s.slug === bench.series)) list.push({ slug: bench.series, ids: [] });
	return list;
}

// The cover is the frame /series/<slug>/ opens on.
function seriesCard({ slug, ids: members }) {
	const card = thumbButton(members[0]);
	card.dataset.series = slug;
	card.title = titleOf(slug);
	card.setAttribute("aria-current", String(slug === bench.series));
	card.append(verso(`${titleOf(slug)} · ${members.length}`));
	return card;
}

export function drawSeries(list = seriesList()) {
	const open = openable(list).find((s) => s.slug === bench.series);
	$("#series-add").hidden = $("#rename-start").hidden = !open;
	if (!open) {
		$("#series-title").textContent = "No series yet";
		$("#series-meta").textContent = "";
		$("#members").replaceChildren();
		return showEmpty("Name one in the strip to start it.");
	}

	$("#series-title").textContent = titleOf(open.slug);
	// The URL: the one thing about it not shown elsewhere.
	$("#series-meta").textContent = `/series/${open.slug}/`;
	$("#members").replaceChildren(...open.ids.map(member));
	showEmpty(open.ids.length ? "" : "No frames yet. Add them from the right.");

	// Everything not in it, newest first. One in another series says which,
	// since adding it moves it.
	const q = query("#pick-filter");
	$("#candidates").replaceChildren(
		...bench.state.entries
			.filter((entry) => entry.series !== open.slug && haystack(entry).includes(q))
			.map((entry) => {
				const button = thumbButton(entry.id);
				button.dataset.add = entry.id;
				if (entry.series) button.append(verso(titleOf(entry.series)));
				return button;
			}),
	);
}

function member(id) {
	const figure = document.createElement("figure");
	figure.className = "member";
	const caption = document.createElement("figcaption");
	const remove = document.createElement("button");
	remove.type = "button";
	remove.className = "quiet";
	remove.dataset.remove = id;
	remove.textContent = "Remove";
	caption.append(verso(id), remove);
	figure.append(thumb(id, 480), caption);
	return figure;
}
