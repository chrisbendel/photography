// The form's inputs: filling them, reading them back, the two things that stop
// free text drifting — vocabulary suggestions and the tag pool — and laying the
// model's reading into them.
import { bench, takeSuggestion } from "./store.js";
import { $, form, say } from "./view.js";
import { combobox } from "./combo.js";

// No `scene`: the model writes it, search reads it, nobody needs to see it here.
// Left out of fields(), a save never touches it.
const PLAIN = ["alt", "caption", "year", "notes"];
const input = (name) => form.elements[name];

// The vocabulary fields — lens, film, format, location, series — are inputs
// marked data-vocab, each a searchable dropdown (combo.js) over the values the
// collection already holds. Pick one or keep typing a new one. Read from the
// markup, so adding a field is one <input>.
const vocabFields = () => form.querySelectorAll("input[data-vocab]");

// Most used first puts the lens on half the roll on top. A field marked
// data-sort="name" goes a→z instead: locations are many, and looked up by name.
function offered(box) {
	const values = (bench.state.vocab[box.name] ?? []).map(({ value }) => value);
	return box.dataset.sort === "name" ? values.sort((a, b) => a.localeCompare(b)) : values;
}

for (const box of vocabFields()) combobox(box, () => offered(box), () => markDirty());

export const markDirty = () => {
	bench.dirty = true;
};

export function fill(entry) {
	for (const name of PLAIN) input(name).value = entry[name] ?? "";
	input("tags").value = (entry.tags ?? []).join(", ");
	for (const box of vocabFields()) box.value = entry[box.name] ?? "";
	drawTagPool();
}

export function fields() {
	const out = { tags: currentTags() };
	for (const name of PLAIN) out[name] = input(name).value;
	for (const box of vocabFields()) out[box.name] = known(box.name, box.value.trim());
	return out;
}

// A value that differs from one already used only by case is that value:
// "grand isle, vt" saves as "Grand Isle, VT". Typed once, ever.
function known(field, value) {
	const match = (bench.state.vocab[field] ?? []).find((o) => o.value.toLowerCase() === value.toLowerCase());
	return match ? match.value : value;
}

// ---------- Tags ----------

const currentTags = () =>
	input("tags")
		.value.split(",")
		.map((t) => t.trim().toLowerCase())
		.filter(Boolean);

// The most-used tags not already on the frame, one click to add. What is on it
// is in the field, said once. Capped, because past a couple of dozen the pool is
// a wall, and the field takes anything.
const POOL = 24;

export function drawTagPool() {
	const chosen = new Set(currentTags());
	const offered = (bench.state.vocab.tags ?? []).filter(({ value }) => !chosen.has(value)).slice(0, POOL);
	$("#tagpool").replaceChildren(
		...offered.map(({ value }) => {
			const chip = document.createElement("button");
			chip.type = "button";
			chip.textContent = value;
			chip.onclick = () => {
				input("tags").value = [...chosen, value].join(", ");
				markDirty();
				drawTagPool();
			};
			return chip;
		}),
	);
}

// ---------- The model's reading ----------

// Into the form, never the file: the button press is the person's say. Alt is
// the one field a human owns — AGENTS.md is explicit, because it is read by the
// one person who can't check it against the print — so it fills only a blank,
// and otherwise the sentence is shown to be taken or left.
export function offer(id) {
	const reading = takeSuggestion(id);
	if (!reading) return;
	const { alt, tags } = reading;
	const typed = input("alt").value.trim();
	if (alt && !typed) input("alt").value = alt;
	input("tags").value = [...new Set([...currentTags(), ...tags])].join(", ");
	drawTagPool();
	markDirty();
	// The tags are in the field, which says it. Only an alt it couldn't write,
	// because one was typed, has nowhere else to show.
	say(alt && typed && alt !== typed ? `It would have written: "${alt}"` : "");
}
