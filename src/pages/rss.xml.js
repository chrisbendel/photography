import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { getImage } from "astro:assets";
import { byNewest } from "../lib/format";

// 800w variant embedded so readers show the print; URLs absolutised via `site`.
export async function GET(context) {
	const photos = (await getCollection("photos")).sort(byNewest);

	const items = await Promise.all(
		photos.map(async (photo) => {
			const { added, image, alt, caption } = photo.data;
			const img = await getImage({ src: image, width: 800 });
			const src = new URL(img.src, context.site).href;
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
		}),
	);

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
