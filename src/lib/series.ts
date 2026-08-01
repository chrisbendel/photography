import { getCollection, type CollectionEntry } from "astro:content";

type Photo = CollectionEntry<"photos">;

export type Series = {
	slug: string;
	title: string;
	photos: Photo[];
};

// "north-shore" → "North Shore".
export function titleFromSlug(slug: string): string {
	return slug
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

// A series exists because photographs name it, and that is the whole of it —
// there is no series collection. Writing `series: north-shore` in frontmatter
// creates it, writing it again joins it, and the last photo to leave removes it.
export async function getSeries(): Promise<Series[]> {
	const photos = await getCollection("photos");

	const slugs = new Set<string>();
	for (const photo of photos) {
		if (photo.data.series) slugs.add(photo.data.series);
	}

	return [...slugs]
		.map((slug) => ({
			slug,
			title: titleFromSlug(slug),
			// Capture chronology matters more than add order here, so `year` wins
			// when both have one; `added` breaks ties within a year.
			photos: photos
				.filter((p) => p.data.series === slug)
				.sort((a, b) => {
					const aY = a.data.year;
					const bY = b.data.year;
					if (aY != null && bY != null && aY !== bY) return bY - aY;
					return b.data.added.valueOf() - a.data.added.valueOf();
				}),
		}))
		.sort((a, b) => a.title.localeCompare(b.title));
}
