import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { byNewest } from "../lib/format";
import { photoSrc } from "../lib/images";

// RSS feed of every photograph, newest first. Each item embeds an 800w
// variant so feed readers show the print, not just text. `site` (set in
// astro.config.mjs) makes every link/image absolute, as RSS requires.
export async function GET(context) {
	const photos = (await getCollection("photos")).sort(byNewest);

	// Image URLs are already absolute (they point at the R2 custom domain), so
	// unlike links they need no resolving against `site`.
	const items = photos.map((photo) => {
		const { added, imageKey, alt, caption } = photo.data;
		const src = photoSrc(imageKey, 800);
		const link = new URL(`/photos/${photo.id}/`, context.site).href;
		const title = caption || `#${photo.id}`;

		return {
			title,
			link,
			pubDate: added,
			description: caption || alt,
			content: `<p><img src="${src}" alt="${escapeHtml(alt)}" /></p>${
				caption ? `<p>${escapeHtml(caption)}</p>` : ""
			}`,
		};
	});

	return rss({
		title: "Chris Bendel — Photography",
		description: "Selected film photography. New prints as they go up.",
		site: context.site,
		items,
		customData: "<language>en-us</language>",
	});
}

function escapeHtml(s = "") {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
