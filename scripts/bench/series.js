// The Series place. A series is only a name photographs share (AGENTS.md), so
// adding a frame writes that name into its `series:` and removing blanks it.
// A photo is in one series at most: adding one from another moves it.
import { api, bench, byId, seriesList, slugify, titleOf } from "./store.js";
import { $, draw, patch, refresh, say } from "./view.js";

export function openSeries(slug) {
	bench.series = slug;
	say("");
	draw();
}

export function newSeries(name) {
	const slug = slugify(name);
	if (slug) openSeries(slug);
	return Boolean(slug);
}

async function setSeries(id, series) {
	try {
		await patch(id, { series });
		return true;
	} catch (err) {
		say(`Failed: ${err.message}`);
		return false;
	}
}

// Silent on success: the frame moving across is the feedback. A move out of
// another series is the one thing worth saying, since that series lost it.
export async function addTo(id) {
	const from = byId(id)?.series;
	if (await setSeries(id, bench.series)) say(from ? `Moved ${id} out of ${titleOf(from)}.` : "");
}

export async function removeFrom(id) {
	if (await setSeries(id, "")) say("");
}

// ---------- Rename ----------

// The title becomes a field in place. Enter renames; Enter, Esc or clicking
// away all end it, through blur.
export function startRename() {
	const box = $("#rename");
	box.value = titleOf(bench.series);
	$("#series-title").hidden = true;
	box.hidden = false;
	box.focus();
	box.select();
}

export function endRename() {
	$("#rename").hidden = true;
	$("#series-title").hidden = false;
}

// Every frame in it takes the new name, one write each, drawn once at the end
// rather than draining frame by frame. Onto an existing name the two become one,
// which can't be pulled apart again, so that asks first. The slug is the URL, so
// the old /series/ address stops working: say so.
export async function renameSeries(name) {
	const from = bench.series;
	const to = slugify(name);
	if (!to || to === from) return;
	const list = seriesList();
	const members = list.find((s) => s.slug === from)?.ids ?? [];
	const into = list.some((s) => s.slug === to);
	if (into && !confirm(`${titleOf(to)} already exists. Move these ${members.length} frames into it? The two become one series.`)) {
		return;
	}

	let last = null;
	for (const [done, id] of members.entries()) {
		try {
			last = await api(`/api/entries/${id}`, "PATCH", { fields: { series: to } });
		} catch (err) {
			if (last) refresh(last);
			return say(`Renamed ${done} of ${members.length} (${err.message}). Rename it to ${titleOf(to)} again to finish.`);
		}
	}
	bench.series = to;
	if (last) refresh(last);
	else draw();
	say(members.length ? `Renamed. /series/${from}/ is now /series/${to}/.` : "");
}
