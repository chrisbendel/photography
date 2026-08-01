# Deferred: move content to R2 + D1, manage it from a browser

**Status:** shelved 2026-07-31, after the first real photo went up. Not rejected —
deferred until the current CLI flow has actually caused pain. The point of
shelving was to separate "this system is wrong" from "this system is new to me."

**Revisit when any of these is true:**

- You've wanted to add a photo and couldn't, because you weren't at the laptop.
- The `photo` → edit → `publish` loop has cost you real friction over ~10 real posts.
- Photo count passes ~100 and hand-editing frontmatter feels like data entry.
- Git repo size starts to hurt (AGENTS.md puts that around 500 MB).

If none of those has happened, the CLI is still the right tool and this plan
stays on the shelf.

## Corrected assessment

Two objections raised against this in conversation turned out to be weak. Recorded
here so the plan isn't re-litigated on bad facts:

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
  loader swaps out, not the routes.

What genuinely does cost something:

- **Git stops being the backup.** Today the backup is versioned, diffable, offline,
  and free. Afterwards it's yours to run. Defusible (see Backups) but it becomes a
  thing you own rather than a thing you get.
- **Dev diverges from prod.** `yarn dev` currently renders exactly what ships.
  Afterwards local reads a seeded local D1. Wrangler emulates this well and prod
  can be pulled down, so it's an annoyance, not a blocker.
- **Static assets are free and unmetered; Worker invocations aren't.** The site
  today cannot cost money by construction. Afterwards it's metered and CPU-capped
  (10 ms/invocation on the free plan). Free at any plausible traffic, but the
  guarantee weakens from "impossible" to "very cheap."
- **Markdown Notes bodies need a runtime renderer.** Astro's built-in markdown
  rendering only applies to file-based collections. That's a new dependency.

## Three variants

### B-static — D1/R2 as source of truth, build-time loader, static output (recommended)

Content lives in D1 + R2. A build-time custom loader queries D1 over its REST API
and hands entries to the existing schema. Output stays static; publishing triggers
a rebuild.

Keeps: static assets unmetered, no CPU ceiling, no runtime markdown dependency
(Astro renders it at build), sharp still usable via `image.remotePatterns` on R2
URLs. Costs: ~1–2 min from publish to live, and the build needs network access to
D1.

This is the sweet spot. Everything gained, almost nothing lost, and the rebuild
lag only affects publishing — not editing, which happens against D1 instantly.

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
  camera      TEXT,
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

This is the part to actually solve, not hand-wave:

- Cron-triggered Worker, nightly: `wrangler d1 export` equivalent via the D1 REST
  API, written to a `backups/` prefix in R2.
- Better: an **export-to-git** job that regenerates `src/content/photos/<id>/` from
  D1 + R2 and commits it. Git then remains a full, diffable, offline backup even
  though it's no longer the source of truth — the current setup inverted, and it
  keeps `git revert` meaningful for content.

The export-to-git job is what makes this plan safe. Build it in the same pass as
the studio, not later.

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

Migration: script walks `src/content/photos/*/index.md`, parses frontmatter,
uploads images to R2, inserts rows. Idempotent, keyed by id. Trivial at current
scale — the value is that it's re-runnable while iterating on the schema.

Rollback: the export-to-git job *is* the rollback. Run it, and the repo is back to
being the source of truth; delete the studio routes and the D1 binding. Keeping
that job working means this decision stays reversible, which is the main reason to
build it early.

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
