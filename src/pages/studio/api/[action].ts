import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
	deletePhoto,
	ensureSeries,
	getPhoto,
	insertPhoto,
	isPhotoId,
	newPhotoId,
	setPublished,
	suggestFromImage,
	triggerRebuild,
	updatePhoto,
} from "../../../lib/studio";

export const prerender = false;

const ACCEPTED = new Map([
	["image/jpeg", "jpg"],
	["image/png", "png"],
	["image/webp", "webp"],
]);
const MAX_BYTES = 25 * 1024 * 1024;

/** Content-addressed key: the same bytes always land on the same URL, so every
 * variant is safe to cache forever and re-uploading never needs a purge. */
async function contentKey(id: string, bytes: ArrayBuffer, ext: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	const hex = [...new Uint8Array(digest)]
		.slice(0, 8)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return `photos/${id}/${hex}.${ext}`;
}

const seeOther = (location: string) => new Response(null, { status: 303, headers: { location } });
const problem = (message: string, status = 400) =>
	new Response(message + "\n", {
		status,
		headers: { "content-type": "text/plain; charset=utf-8" },
	});

export const POST: APIRoute = async ({ params, request }) => {
	const db = env.DB;
	const form = await request.formData();
	const id = String(form.get("id") ?? "");

	// Every action except upload targets an existing photo.
	if (params.action !== "upload" && params.action !== "rebuild") {
		if (!isPhotoId(id)) return problem(`Invalid id "${id}".`);
		if (!(await getPhoto(db, id))) return problem(`No photo ${id}.`, 404);
	}

	switch (params.action) {
		case "upload": {
			const file = form.get("file");
			if (!(file instanceof File) || file.size === 0) return problem("No file uploaded.");

			const ext = ACCEPTED.get(file.type);
			if (!ext) return problem(`Unsupported type ${file.type} — use jpg, png, or webp.`);
			if (file.size > MAX_BYTES) {
				return problem(`${(file.size / 1024 / 1024).toFixed(1)} MB exceeds the 25 MB limit.`);
			}

			const bytes = await file.arrayBuffer();
			const newId = await newPhotoId(db);
			const key = await contentKey(newId, bytes, ext);

			await env.BUCKET.put(key, bytes, {
				httpMetadata: {
					contentType: file.type,
					cacheControl: "public, max-age=31536000, immutable",
				},
			});

			// Dimensions come from the browser — sharp can't run on Workers, and
			// they're only needed to reserve layout space. Absent is survivable.
			const width = Number(form.get("width")) || undefined;
			const height = Number(form.get("height")) || undefined;

			await insertPhoto(db, {
				id: newId,
				added: new Date().toISOString().slice(0, 10),
				alt: "",
				image_key: key,
				width,
				height,
			});

			return seeOther(`/studio/${newId}/`);
		}

		case "save": {
			const series = String(form.get("series") ?? "").trim();
			if (series) await ensureSeries(db, series);
			try {
				await updatePhoto(db, id, form);
			} catch (err) {
				return problem(err instanceof Error ? err.message : String(err));
			}
			return seeOther(`/studio/${id}/?saved=1`);
		}

		case "publish":
		case "unpublish": {
			const publish = params.action === "publish";
			if (publish) {
				const row = await getPhoto(db, id);
				if (!row?.alt?.trim()) return problem("Alt text is required before publishing.");
			}
			await setPublished(db, id, publish);
			const built = await triggerRebuild(env.DEPLOY_HOOK_URL);
			return seeOther(`/studio/${id}/?${publish ? "published" : "unpublished"}=${built ? "building" : "pending"}`);
		}

		case "delete": {
			await deletePhoto(db, env.BUCKET, id);
			return seeOther("/studio/");
		}

		case "rebuild": {
			const built = await triggerRebuild(env.DEPLOY_HOOK_URL);
			return seeOther(`/studio/?rebuild=${built ? "building" : "pending"}`);
		}

		case "suggest": {
			const row = await getPhoto(db, id);
			const object = await env.BUCKET.get(row!.image_key);
			if (!object) return problem("Image missing from R2.", 404);

			try {
				const suggestion = await suggestFromImage(env, await object.arrayBuffer());
				return Response.json(suggestion);
			} catch (err) {
				return problem(err instanceof Error ? err.message : String(err), 502);
			}
		}

		default:
			return problem(`Unknown action "${params.action}".`, 404);
	}
};
