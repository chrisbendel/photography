// Newest `added` first, id as tiebreak. `added` is machine-stamped, never
// hand-edited, so it's safe to sort on.
export function byNewest<T extends { id: string; data: { added: Date } }>(
	a: T,
	b: T,
): number {
	const diff = b.data.added.valueOf() - a.data.added.valueOf();
	return diff !== 0 ? diff : b.id.localeCompare(a.id);
}

// Verso treatment: `4x5` in frontmatter renders as `4×5`.
export function formatLabel(f: string): string {
	return f.replace("x", "×");
}
