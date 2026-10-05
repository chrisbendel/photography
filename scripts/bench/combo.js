// A searchable dropdown for a text field. Focus shows every option, typing
// narrows them, and whatever is typed stands if nothing is picked. Built here
// because a <datalist> popup can't be styled and hides the list until you type.
// One list, moved under whichever field has focus. No imports: it knows nothing
// about frames.

const list = document.createElement("ul");
list.id = "choices";
list.setAttribute("role", "listbox");
list.hidden = true;

let field = null;
let then = null;
let shown = [];
let active = -1;

list.onmousedown = (event) => event.preventDefault(); // keep focus in the field
list.onclick = (event) => {
	const row = event.target.closest("[data-index]");
	if (row) pick(shown[Number(row.dataset.index)]);
	else close();
};

// `offer` returns the field's options as strings; `picked` runs after a pick.
export function combobox(input, offer, picked) {
	input.setAttribute("role", "combobox");
	input.setAttribute("aria-autocomplete", "list");
	input.setAttribute("aria-controls", "choices");
	input.setAttribute("aria-expanded", "false");
	// Focus shows them all: what is set is one choice among the rest.
	const show = (query) => open(input, offer, picked, query);
	input.addEventListener("focus", () => show(""));
	input.addEventListener("input", () => show(input.value));
	input.addEventListener("blur", close);
	input.addEventListener("keydown", (event) => {
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			if (list.hidden) return show("");
			move(event.key === "ArrowDown" ? 1 : -1);
		}
		if (list.hidden) return;
		// Enter picks the highlighted row, or keeps what is typed; either way it
		// closes the list rather than submitting the form.
		if (event.key === "Enter") {
			event.preventDefault();
			if (shown[active] !== undefined) pick(shown[active]);
			else close();
		}
		if (event.key === "Escape") {
			event.preventDefault();
			close();
		}
	});
}

function open(input, offer, picked, query) {
	field = input;
	then = picked;
	const all = offer();
	const q = query.trim().toLowerCase();
	shown = all.filter((option) => option.toLowerCase().includes(q));
	active = -1;

	const rows = shown.map((option, index) => {
		const row = document.createElement("li");
		row.id = `choice-${index}`;
		row.setAttribute("role", "option");
		row.dataset.index = index;
		row.textContent = option;
		if (option === input.value) row.className = "current";
		return row;
	});
	// A value the list doesn't hold is said to be new, so a typo is seen as one.
	const typed = input.value.trim();
	if (typed && !all.some((option) => option.toLowerCase() === typed.toLowerCase())) {
		const row = document.createElement("li");
		row.className = "new";
		row.textContent = `New: ${typed}`;
		rows.push(row);
	}

	input.after(list);
	list.replaceChildren(...rows);
	list.hidden = !rows.length;
	input.setAttribute("aria-expanded", String(!list.hidden));
	input.removeAttribute("aria-activedescendant");
	if (!list.hidden) list.scrollIntoView({ block: "nearest" });
}

function move(by) {
	active = Math.max(0, Math.min(shown.length - 1, active + by));
	for (const row of list.children) row.setAttribute("aria-selected", String(row.id === `choice-${active}`));
	const row = list.querySelector(`#choice-${active}`);
	if (!row) return;
	field.setAttribute("aria-activedescendant", row.id);
	row.scrollIntoView({ block: "nearest" });
}

function pick(value) {
	field.value = value;
	close();
	then?.();
}

function close() {
	list.hidden = true;
	field?.setAttribute("aria-expanded", "false");
	field?.removeAttribute("aria-activedescendant");
	active = -1;
}
