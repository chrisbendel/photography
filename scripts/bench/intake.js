// Files in: one goes straight to To do, several wait on what they share first.
import { api, bench, setTodo } from "./store.js";
import { $, refresh, say } from "./view.js";
import { closeBatch, leave, openBatch, select } from "./entry.js";
import { readImages } from "./reader.js";

// Roll order: scanners number their frames, so the filename is the sequence.
export function addImages(list) {
	const files = [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
	if (!files.length || !leave()) return;
	if (files.length === 1) createAll(files, {});
	else openBatch(files);
}

// One POST per file: sixteen scans in one body would pass the server's cap.
export async function createAll(files, shared) {
	$("#save").disabled = true;
	const added = [];
	const failed = [];
	for (const [i, file] of files.entries()) {
		say(files.length > 1 ? `Copying ${i + 1} of ${files.length}: ${file.name}` : `Copying ${file.name}...`);
		try {
			const created = await api("/api/entries", "POST", { filename: file.name, data: await base64(file), fields: shared });
			refresh(created);
			added.push(created.id);
		} catch (err) {
			failed.push(`${file.name} (${err.message})`);
		}
	}
	$("#save").disabled = false;
	// A modal, because the status line is overwritten by the first read.
	if (failed.length) alert(`Not added:\n${failed.join("\n")}`);
	if (!added.length) return say("");

	closeBatch();
	setTodo([...bench.todo, ...added]);
	for (const id of added) bench.unread.add(id);
	bench.place = "todo";
	select(added[0]);
	readImages();
}

function base64(file) {
	return new Promise((done, fail) => {
		const reader = new FileReader();
		reader.onload = () => done(String(reader.result).split(",")[1]);
		reader.onerror = () => fail(new Error(`Couldn't read ${file.name}`));
		reader.readAsDataURL(file);
	});
}
