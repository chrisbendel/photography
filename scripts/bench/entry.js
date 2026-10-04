// What the form is open on — one frame, a batch waiting on its shared fields, or
// nothing — and the three ways a frame is written: Save, Done and Delete.
import { api, bench, byId, seriesList, setTodo, titleOf } from "./store.js";
import { $, draw, form, ids, neighbour, patch, refresh, say, thumbUrl } from "./view.js";
import { fields, fill, offer } from "./fields.js";

// The one guard on unsaved typing, called where a person moves away. Anything
// the bench does on its own (after a save, a delete, a new roll) goes straight
// to select().
export function leave() {
	if (bench.dirty && !confirm("Discard unsaved changes?")) return false;
	bench.dirty = false;
	closeBatch();
	return true;
}

export function select(id) {
	const entry = byId(id);
	if (!entry) return;
	// A different frame starts at the top of its fields, alt first.
	if (id !== bench.current) $("#bench").scrollTop = 0;
	bench.current = id;
	bench.dirty = false;

	// What the fields don't show: where it is on the roll, and its series, which
	// is set in the Series place.
	const at = bench.todo.indexOf(id);
	$("#idtag").textContent = [id, at >= 0 && `${at + 1} of ${bench.todo.length}`, entry.series && titleOf(entry.series)]
		.filter(Boolean)
		.join(" · ");
	$("#preview").src = thumbUrl(id, 1600);
	$("#preview").alt = entry.alt || "";
	fill(entry);
	say(bench.unread.has(id) ? "Reading… alt and tags land here when done." : "");
	offer(id);
	draw();
}

function deselect() {
	bench.current = null;
	bench.dirty = false;
	draw();
}

const goTo = (id) => (id ? select(id) : deselect());

export const openFirst = () => goTo(ids()[0]);

export function show(place) {
	if (place === bench.place && !bench.pending.length) return;
	if (!leave()) return;
	bench.place = place;
	say(""); // a message belongs to the place it was said in
	// Series opens on the last one looked at, if it still exists, else the first.
	const list = seriesList();
	if (!list.some((s) => s.slug === bench.series)) bench.series = list[0]?.slug ?? null;
	openFirst();
}

// ---------- Batch ----------

export function openBatch(files) {
	bench.pending = files;
	bench.current = null;
	$("#title").textContent = `${files.length} new frames`;
	$("#idtag").textContent = "Set what they share. The rest is one frame at a time.";
	$("#batch").replaceChildren(
		...files.map((file) => {
			const img = new Image();
			img.src = URL.createObjectURL(file);
			img.alt = img.title = file.name;
			return img;
		}),
	);
	fill({});
	say("");
	draw();
}

export function closeBatch() {
	if (!bench.pending.length) return;
	for (const img of $("#batch").children) URL.revokeObjectURL(img.src);
	$("#batch").replaceChildren();
	bench.pending = [];
}

// Cancel is the discard, so it doesn't ask.
export function cancelBatch() {
	closeBatch();
	bench.dirty = false;
	openFirst();
}

// ---------- Writing ----------

// The server sanitises what it writes and sends the whole state back.
async function write() {
	$("#save").disabled = true;
	say("Saving...");
	try {
		await patch(bench.current, fields());
		return true;
	} catch (err) {
		say(`Failed: ${err.message}`);
		return false;
	} finally {
		$("#save").disabled = false;
	}
}

// Writes, then one rule: a frame still in the strip is re-opened from disk, so
// the form shows what was written; a frame the write took out of the strip — Done
// filing it, or a save filling the gap the Sheet is narrowed to — makes way for
// the next, caret in the field being worked through.
async function commit(after) {
	const id = bench.current;
	const next = neighbour(id);
	if (!id || !(await write())) return;
	after?.(id);
	if (ids().includes(id)) {
		select(id);
		say("Saved.");
		return;
	}
	goTo(next);
	if (next) form.elements[bench.place === "sheet" && bench.gap ? bench.gap : "alt"].focus();
}

// ⌘S saves in To do too, for a frame you mean to come back to.
export const save = () => commit();

export const done = () => commit((id) => setTodo(bench.todo.filter((t) => t !== id)));

export async function remove() {
	const id = bench.current;
	if (!id) return;
	const sure = confirm(
		`Delete ${id}? This removes src/content/photos/${id}/, the image and the entry.\n\n` +
			"If it was committed, git restore brings it back. If not, it is gone.",
	);
	if (!sure) return;
	const next = neighbour(id);
	try {
		refresh(await api(`/api/entries/${id}`, "DELETE"));
	} catch (err) {
		return say(`Failed: ${err.message}`);
	}
	goTo(next);
}
