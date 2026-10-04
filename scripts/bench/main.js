// The bench: wiring and start-up. Served as plain ES modules by bench.mjs — no
// build step. If it ever wants one, it has outgrown its brief (AGENTS.md).
import { action, api, bench, byId, setLayout } from "./store.js";
import { $, draw, drawSeries, drawStrip, form, ids, refresh, step } from "./view.js";
import { drawTagPool, fields, markDirty } from "./fields.js";
import { cancelBatch, done, leave, openFirst, remove, save, select, show } from "./entry.js";
import { readImages, reread } from "./reader.js";
import { addImages, createAll } from "./intake.js";
import { addTo, endRename, newSeries, openSeries, removeFrom, renameSeries, startRename } from "./series.js";

const run = { add: () => createAll(bench.pending, fields()), done, save };

// A busy button means a write is in flight; a second one would duplicate it.
const act = (name) => {
	if (!$("#save").disabled) run[name]?.();
};

form.onsubmit = (event) => {
	event.preventDefault();
	act(action());
};

const layOut = (layout) => {
	setLayout(layout);
	draw();
};

// A person moving to another frame: where unsaved typing is guarded.
const pick = (id) => {
	if (id && id !== bench.current && leave()) select(id);
};

$("#tab-todo").onclick = () => show("todo");
$("#tab-sheet").onclick = () => show("sheet");
$("#tab-series").onclick = () => show("series");

// The strip holds frames, or in the Series place, series.
$("#frames").onclick = (event) => {
	const card = event.target.closest(".frame");
	if (card?.dataset.series) openSeries(card.dataset.series);
	else pick(card?.dataset.id);
};
// Choosing a frame in the grid brings it onto the stage, strip back underneath.
$("#grid").onclick = (event) => {
	const id = event.target.closest(".frame")?.dataset.id;
	if (!id) return;
	pick(id);
	if (bench.current === id) layOut("strip");
};
$("#layouts").onclick = (event) => {
	const layout = event.target.closest("[data-layout]")?.dataset.layout;
	if (layout) layOut(layout);
};
$("#members").onclick = (event) => {
	const id = event.target.closest("[data-remove]")?.dataset.remove;
	if (id) removeFrom(id);
};
$("#candidates").onclick = (event) => {
	const id = event.target.closest("[data-add]")?.dataset.add;
	if (id) addTo(id);
};
$("#pick-filter").oninput = () => drawSeries();
$("#rename-start").onclick = startRename;
$("#rename").onkeydown = (event) => {
	if (event.key === "Enter") renameSeries(event.target.value);
	if (event.key === "Enter" || event.key === "Escape") event.target.blur();
};
$("#rename").onblur = endRename;
$("#new-series").onkeydown = (event) => {
	if (event.key === "Enter" && newSeries(event.target.value)) event.target.value = "";
};
$("#filter").oninput = drawStrip;
// A gap chip narrows the Sheet and opens the first frame missing it.
$("#gaps").onclick = (event) => {
	const field = event.target.closest("[data-gap]")?.dataset.gap;
	if (!field) return;
	bench.gap = bench.gap === field ? null : field;
	draw();
	if (!ids().includes(bench.current)) pick(ids()[0]);
};
$("#cancel").onclick = cancelBatch;
$("#reread").onclick = reread;
$("#delete").onclick = remove;

form.elements.tags.oninput = drawTagPool;
form.addEventListener("input", markDirty);
addEventListener("beforeunload", (event) => {
	if (bench.dirty) event.preventDefault();
});

// ---------- Light ----------

// Labelled with what it will do, same wording as the cord's tooltip.
function drawLight() {
	$("#light").textContent = document.documentElement.dataset.theme === "dark" ? "Turn light on" : "Turn light off";
}

$("#light").onclick = () => {
	const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
	document.documentElement.dataset.theme = next;
	try {
		localStorage.setItem("theme", next);
	} catch (_) {}
	drawLight();
};

drawLight();

// ---------- Files in ----------

$("#add").onclick = () => $("#file").click();
$("#file").onchange = (event) => {
	addImages(event.target.files);
	event.target.value = "";
};

for (const type of ["dragenter", "dragover"]) {
	document.addEventListener(type, (event) => {
		event.preventDefault();
		document.body.classList.add("dropping");
	});
}
document.addEventListener("dragleave", (event) => {
	if (event.relatedTarget === null) document.body.classList.remove("dropping");
});
document.addEventListener("drop", (event) => {
	event.preventDefault();
	document.body.classList.remove("dropping");
	addImages(event.dataTransfer.files);
});

// ---------- Keys ----------

document.addEventListener("keydown", (event) => {
	const mod = event.metaKey || event.ctrlKey;
	// ⌘S saves in place, even in To do.
	if (mod && event.key === "s") {
		event.preventDefault();
		act(action() === "done" ? "save" : action());
	}
	if (mod && event.key === "Enter" && !form.hidden) {
		event.preventDefault();
		form.requestSubmit();
	}
	// Arrows walk the strip or grid, and G swaps them, unless a field has the caret.
	if (mod || event.target.closest?.("input, textarea")) return;
	const by = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
	if (by) {
		event.preventDefault();
		pick(step(bench.current, by));
	}
	if (event.key === "g" && bench.place !== "series") layOut(bench.layout === "grid" ? "strip" : "grid");
});

// ---------- Start ----------

refresh(await api("/api/state"));

// A reload mid-roll: frames still without alt go back to the model.
for (const id of bench.todo) if (!byId(id).alt) bench.unread.add(id);
bench.place = bench.todo.length ? "todo" : "sheet";
openFirst();
readImages();
