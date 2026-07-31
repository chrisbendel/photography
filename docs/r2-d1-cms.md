# Content on R2 + D1, managed from a browser

**Status:** built 2026-07-31 on the `swap-infra` branch. Shelved earlier the same
day, then picked up once two of the three objections against it turned out to be
wrong (below).

Variant built: **B-static** — D1/R2 hold the content, a build-time content loader
reads D1, and every public page stays prerendered with zero client JS. `/studio`
is the only on-demand route. Publishing sets a flag and triggers a rebuild; the
site goes live a minute or two later.

The **hybrid** (git as published truth, D1/R2 as a drafts inbox) was not built.
It stays the fallback if the rebuild lag becomes annoying *and* the backup story
proves insufficient — it's a smaller step from here than from where we started.

## As built: deltas from this plan

- **No `AI` binding.** Workers AI has no local emulation, so binding it forced
  every `astro build` into a remote proxy session and a wrangler login. The studio
  calls the Workers AI REST API instead.
- **`Astro.locals.runtime.env` is gone in Astro 6.** Worker bindings come from
  `import { env } from "cloudflare:workers"`.
- **`workers_dev: false`.** An Access policy scoped to `photos.cbendel.me/studio*`
  would not cover the same Worker's `workers.dev` URL, leaving a second door where
  the middleware's header check — spoofable on its own — is the only guard.
- **`STUDIO_DEV_BYPASS`.** `wrangler dev` runs a production build, so
  `import.meta.env.DEV` is false there and the Access gate would lock local
  testing out. `yarn dev:worker` sets this var; it must never be set on the
  deployed Worker.
- **CSRF protection is on by default in Astro 6** and covers the studio's form
  posts — origin-less POSTs are rejected with 403.
- **Deploy uses Cloudflare Workers Builds**, not a GitHub Action, so the studio can
  trigger a rebuild by POSTing a deploy hook URL with no token in the Worker. The
  only Action is the nightly backup, which needs to commit.

## Not yet verified

Everything below was tested against a local emulated D1 and R2 — studio pages,
upload, save, publish/unpublish, delete, validation, the auth gate, tag
normalisation, series auto-creation. What could not be tested without Cloudflare
credentials, and should be checked on first run:

Since verified against real Cloudflare resources:

- ✅ The build-time loader against real D1, `reference("series")` resolving across
  collections, 11 pages prerendered.
- ✅ Cloudflare Images transformations on the R2 custom domain —
  `cf-resized: internal=ok`, 2.9 MB original to 206 KB at 1600w.
- ✅ Migration and export round-tripped with a byte-identical image (both scripts
  since removed).

Still unverified:

- Workers AI returning a parseable caption/tag response from llava.
- Access issuing the headers the middleware expects.
- Workers Builds running the build with variables set from the dashboard.

## Corrected assessment

Three objections raised against this turned out to be weak. Recorded here so the
decision isn't re-litigated on bad facts:

- **"You lose sharp, and there's no free replacement on Workers."** Mostly wrong.
  Cloudflare Images does 5,000 unique transformations/month free on the *free*
  plan, then $0.50/1,000. About 100 photos × 4 srcset widths ≈ 400/month. Edge
  transforms are arguably better than build-time sharp: widths on demand, format
  negotiated per `Accept` header, no build step. sharp being unable to run on
  Workers is true but no longer load-bearing.
- **"Every route gets rewritten off content collections."** Wrong. Astro's content
  layer takes custom loaders. A build-time loader keeps `getCollection()` and the
  Zod schemas exactly as they are; live loaders (`getLiveCollection()` /
  `getLiveEntry()`) do the same at request time. Templates barely change — the
  loader swaps out, not the routes. Confirmed while building: the eight routes
  needed only their image calls rewritten. `getStaticPaths`, `getEntry`,
  `render()`, and `reference()` all work untouched.
- **"Markdown bodies need a runtime renderer."** Wrong. Loaders get
  `renderMarkdown()` in their context (astro@5.9+), so `notes` renders at build
  and `<Content />` still works. No markdown dependency was added — in fact the
  build *dropped* a dependency, since the local Florence-2 tagger went away.

What genuinely does cost something:

- **Git stops being the backup**, and after the export job was removed, nothing
  replaced it for images. Previously the backup was versioned, diffable, offline
  and free. Now metadata leans on D1 Time Travel and images lean on your scans.
  This is the cost that was accepted rather than avoided.
- **Dev diverges from prod — avoided.** The build-time loader reads *remote* D1
  over the REST API in both local dev and CI, so `yarn dev` shows real content and
  there's one code path. The local emulated D1 is only used for `/studio` testing
  via `yarn dev:worker`.
- **Tagging is no longer offline or API-free.** The genuine loss. Florence-2 via
  transformers.js can't run on Workers, so suggestions now go through the Workers
  AI REST API. The local tagger and its dependency were deleted rather than left
  to rot.
- **Worker invocations are metered where static assets aren't** — but only for
  `/studio`. Public pages stayed prerendered, so they're still served as free,
  unmetered static assets. This cost was avoided by picking B-static.

## Three variants

### B-static — D1/R2 as source of truth, build-time loader, static output (built)

Content lives in D1 + R2. A build-time custom loader queries D1 over its REST API
and hands entries to the existing schema. Output stays static; publishing triggers
a rebuild.

Keeps: static assets unmetered, no CPU ceiling, no runtime markdown dependency,
zero client JS on public pages. Costs: ~1–2 min from publish to live, and the
build needs network access to D1.

The sweet spot, and what got built. The rebuild lag only affects publishing — not
editing, which happens against D1 instantly.

### B-live — live loaders, on-demand rendering

Same data layer, but routes render per request via `getLiveCollection()`. Instant
publishing and true remote draft preview. Costs: metered invocations, the 10 ms
free-plan CPU ceiling (load-test this — Astro render plus runtime markdown is the
risk), a caching and purge strategy, and a runtime markdown renderer.

Pick this only if the rebuild lag in B-static turns out to actually bother you.
Note what it costs: the public pages are currently prerendered with *zero* client
JS, and asset requests are unmetered. B-live trades that away to save ~90 seconds
of publish lag on a site with no interactive elements. Bad deal unless something
changes.

### Hybrid — R2/D1 as a drafts inbox, git as published truth

Studio writes drafts to R2 + D1 (instant, remote, no commits). "Publish" writes
`src/content/photos/<id>/` to git via the GitHub API and clears the D1 row.
Published content keeps every current property; the database only ever holds churny
unfinished work.

Smallest step that gets remote uploads. Good if the goal is narrowly "add photos
from my phone" rather than "replace the CLI."

## Data model

```sql
CREATE TABLE photos (
  id          TEXT PRIMARY KEY,        -- 6-char hex, unchanged
  added       TEXT NOT NULL,           -- ISO date, drives newest-first
  date        TEXT,                    -- when the shutter clicked
  alt         TEXT NOT NULL,
  caption     TEXT,
  lens      TEXT,
  film        TEXT,
  location    TEXT,
  format      TEXT,
  series      TEXT REFERENCES series(slug),
  notes       TEXT,                    -- markdown body
  image_key   TEXT NOT NULL,           -- R2 key
  published   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE series (
  slug        TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  cover       TEXT REFERENCES photos(id),
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE photo_tags (
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  tag      TEXT NOT NULL,
  PRIMARY KEY (photo_id, tag)
);
```

`published` replaces the archive/live directory split — the same distinction, one
column. Note this reintroduces the `draft` field AGENTS.md explicitly rejects; the
justification is that a filesystem move is no longer available as the mechanism.

R2 keys: `photos/<id>/<sha256-prefix>.jpg`. Content-addressed so they can be served
`immutable` and cached forever; re-uploading a photo writes a new key rather than
invalidating a cache.

## Serving images

R2 bucket on a custom domain, fronted by Cloudflare Images transformations:

```
https://img.photos.cbendel.me/cdn-cgi/image/width=1200,quality=85,format=auto/photos/<id>/<hash>.jpg
```

`Cache-Control: public, max-age=31536000, immutable`. Edge caches it, so R2 Class B
ops go to roughly zero after the first fetch per width. Build a small `srcset`
helper to replace `<Image>`; in B-static, `image.remotePatterns` lets `<Image>`
optimize R2 URLs at build instead, which is simpler.

## Caching and purge

- Images: immutable, content-addressed, cached forever. No purge needed.
- HTML (B-live only): Cache Rule with cache-everything plus an edge TTL, and a
  purge-by-URL API call from the studio on publish. Edge hits then serve without
  re-invoking the Worker.
- D1: with HTML cached, steady-state traffic barely reads the database at all.

## Auth

Cloudflare Access (Zero Trust) scoped to `/studio` — email OTP or Google SSO, free
up to 50 users, zero application code, no credentials in the repo. In B-live the
public site is dynamic too, so scope the Access policy to the `/studio` path and
not the whole app. Do not hand-roll a password check.

## Backups

Originally planned as an export-to-git job — regenerate the markdown folders from
D1 + R2 and commit them, so git stayed a full offline restore point and
`git revert` still meant something for content. It was built, verified to
round-trip with a byte-identical image, and then **deliberately removed**: the
owner didn't want the extra machinery in the repo, having decided the redundancy
wasn't worth what it cost to keep around.

What covers the gap now:

- **Metadata:** D1 Time Travel, 30 days of point-in-time restore. No setup needed.
- **Images:** nothing. Deleting a photo in `/studio` deletes the R2 object and
  that's the only copy. The original scans on disk are the backup.

If that ever bites, `git log` has the deleted `scripts/export-to-git.mjs` and the
nightly Action alongside it — restoring the pair is a `git show` away, and this is
the reason to reach for it.

## Tag suggestions

Florence-2 via transformers.js cannot run on Workers — onnxruntime plus ~500 MB of
weights against a hard memory and CPU ceiling. Options, in order of preference:

1. **Workers AI** vision model for caption plus tags — same platform, one binding,
   ~20 lines. Breaks the "offline, no API" property AGENTS.md claims for tagging.
2. **Keep it local**: `yarn suggest-tags` still runs on the laptop against a photo
   already in D1, writing suggestions back. Preserves the offline property; means
   remote uploads land untagged until you're at a real machine.
3. Browser-side transformers.js. Technically works, miserable on a phone.

## Studio UI

Single route, no framework, progressive enhancement:

- Drag-and-drop upload → `request.formData()` (native in Node 22 and on Workers).
- Series picker: `<input list="series-list">` + `<datalist>`. Native combobox —
  select an existing series or type a new name, zero JS.
- Tag suggestions as checkboxes you tick, not comments you copy.
- List of drafts and published with per-row publish/unpublish.
- Client-side canvas downscale before upload if phone-network upload time annoys.

## Migration and rollback

Migration is done and the script is gone. It walked `src/content/photos/*/index.md`,
uploaded images to R2 and upserted rows keyed by id — which is what made it safe to
re-run after a transient D1 500 killed the first attempt halfway through. One photo
moved across; the content was then cleared for a fresh start, and the script was
deleted rather than left lying around for a job it will never do again.

Rollback is no longer a prepared path. With the export job removed, reverting to
markdown-in-git means reading content back out of D1 and R2 by hand, or recovering
the deleted scripts from `git log`.

## Cost

Free, with room to spare. Verified 2026-07-31:

| | Free tier | Realistic usage |
|---|---|---|
| R2 storage | 10 GB | ~3,300 photos at 3 MB |
| R2 Class A (writes) | 1M/mo | a few per photo added |
| R2 Class B (reads) | 10M/mo | ~zero once cached |
| D1 rows read | 5M/day | ~100 per uncached page view |
| D1 rows written | 100k/day | a handful per edit |
| Workers requests | 100k/day | ≈1 req/sec sustained |
| Images transforms | 5,000/mo | ~400 for 100 photos × 4 widths |

R2 egress is free at any volume. Overages are negligible: 100 GB of archival TIFFs
is $1.50/month. Workers Paid at $5/month lifts the 10 ms CPU cap if B-live needs it.

Cost is not the deciding variable here — all variants are free or ~$5/month. Decide
on the backup story and the dev/prod divergence, not the bill.

## Effort

- D1 schema + migrations: small
- R2 upload + serve + `srcset` helper: small
- Custom content loader (B-static) or live loaders (B-live): small-to-medium; the
  routes mostly don't change
- Studio UI: the bulk of it
- Export-to-git backup job: small, non-negotiable
- Cron backup + Access config: mostly dashboard work

Roughly a weekend for B-static, more for B-live once caching and purge are in.

## Prerequisite for anything remote

`yarn deploy` currently runs `wrangler deploy` from the laptop, with no CI. A
commit or publish from a phone is inert until someone opens a laptop. Connect
Cloudflare Workers Builds or a GitHub Action first — independently useful, and a
hard blocker for every remote variant including the hybrid.
