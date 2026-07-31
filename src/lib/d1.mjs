// D1 over its REST API, shared by the build-time content loader and the
// node scripts. The Worker itself uses the `DB` binding instead — this exists
// because builds and CLI scripts run outside the Worker runtime and still need
// to read the database.
//
// Needs CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_D1_TOKEN in the environment.

const API = "https://api.cloudflare.com/client/v4";

/** True when the environment has everything needed to reach D1. */
export function hasD1Credentials(env = process.env) {
	return Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_D1_DATABASE_ID && env.CLOUDFLARE_D1_TOKEN);
}

/**
 * Run one statement. Returns the result rows.
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<Record<string, any>[]>}
 */
export async function d1Query(sql, params = [], env = process.env) {
	const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_D1_TOKEN } = env;
	if (!hasD1Credentials(env)) {
		throw new Error(
			"Missing D1 credentials — set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_D1_TOKEN.",
		);
	}

	const res = await fetch(
		`${API}/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database/${CLOUDFLARE_D1_DATABASE_ID}/query`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${CLOUDFLARE_D1_TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ sql, params }),
		},
	);

	const json = await res.json();
	if (!res.ok || !json.success) {
		const detail = (json.errors ?? []).map((e) => e.message).join("; ");
		throw new Error(`D1 query failed (${res.status}): ${detail || res.statusText}`);
	}

	return json.result?.[0]?.results ?? [];
}
