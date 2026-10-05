// The vision model's queue. Every new frame is read, because a blank alt fails
// check-photos; a read never overwrites anything a person has typed.
import { api, bench, byId, suggest } from "./store.js";
import { draw, patch, say } from "./view.js";
import { offer } from "./fields.js";

export function reread() {
	if (!bench.current) return;
	bench.unread.add(bench.current);
	readImages();
}

let busy = false;

// One at a time, the frame on screen first: each read is seconds of CPU, and
// the frame being looked at is the one being waited on.
export async function readImages() {
	if (busy) return;
	busy = true;
	const { unread } = bench;
	while (unread.size) {
		const id = unread.has(bench.current) ? bench.current : unread.values().next().value;
		draw();
		if (id === bench.current) say("Reading… the first read of a session loads the model, about a minute.");
		try {
			await land(id, await api(`/api/entries/${id}/suggest`, "POST"));
		} catch (err) {
			// Only the open frame's failure is news here; any other shows "no alt"
			// on the strip, and Read again retries it.
			if (id === bench.current) say(`Couldn't read it: ${err.message}`);
		} finally {
			unread.delete(id);
		}
	}
	busy = false;
	draw();
}

// Every reading lands the same way. Alt and scene go into blanks on disk, as
// `yarn photo` writes them, so a frame is never left without alt. The whole
// reading is kept for the form, which takes it now if the frame is open, or
// whenever it is opened.
async function land(id, reading) {
	const entry = byId(id);
	if (!entry) return; // deleted while it was being read
	const blanks = {};
	if (reading.alt && !entry.alt) blanks.alt = reading.alt;
	if (reading.scene && !entry.scene) blanks.scene = reading.scene;
	if (Object.keys(blanks).length) await patch(id, blanks);
	suggest(id, reading);
	if (id === bench.current) offer(id);
}
