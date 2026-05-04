// Sort by `added` (when entry joined the site) descending — newest at top.
// `added` is machine-stamped by `new-photo` and never user-edited, so it's
// safe to rely on. Falls back to id compare if two adds tied to the same
// instant (extremely rare).
export function byNewest<T extends { id: string; data: { added: Date } }>(
	a: T,
	b: T,
): number {
	const diff = b.data.added.valueOf() - a.data.added.valueOf();
	return diff !== 0 ? diff : b.id.localeCompare(a.id);
}

// Print-format helpers. Used by series view to sort/group photos by paper size.
// Larger formats sort first — mirrors how prints stack physically in a paper box.

export const FORMAT_RANK: Record<string, number> = {
	"8x10": 100,
	"5x7": 90,
	"4x5": 80,
	"6x9": 70,
	"6x8": 65,
	"6x7": 60,
	"6x6": 50,
	"6x4.5": 40,
	"645": 40,
	"35mm": 20,
	"half-frame": 10,
};

export function formatRank(f?: string): number {
	if (!f) return 0;
	return FORMAT_RANK[f.toLowerCase()] ?? 0;
}

export function formatLabel(f?: string): string {
	if (!f) return "Unspecified";
	return f.replace("x", "×");
}
