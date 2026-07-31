import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";

// /studio is gated by Cloudflare Access, which terminates at the edge and adds
// these headers. This check exists so the gate fails *closed*: if the Access
// policy is missing or misconfigured, the studio is unreachable rather than
// wide open. It is not the security boundary itself — Access is.
//
// Only on-demand routes reach middleware; the prerendered public pages are
// static files and never pass through here.
export const onRequest = defineMiddleware(async (context, next) => {
	if (!context.url.pathname.startsWith("/studio")) return next();

	// `astro dev` has no Access in front of it.
	if (import.meta.env.DEV) return next();

	// `wrangler dev` runs a *production* build, so the check above is false there.
	// `yarn dev:worker` passes this var explicitly. Never set it on the deployed
	// Worker — it disables the gate.
	if (env.STUDIO_DEV_BYPASS === "1") return next();

	const email = context.request.headers.get("Cf-Access-Authenticated-User-Email");
	const jwt = context.request.headers.get("Cf-Access-Jwt-Assertion");

	if (!email || !jwt) {
		return new Response(
			"Not available.\n\n/studio requires a Cloudflare Access policy on this path.\n",
			{ status: 404, headers: { "content-type": "text/plain; charset=utf-8" } },
		);
	}

	context.locals.studioUser = email;
	return next();
});
