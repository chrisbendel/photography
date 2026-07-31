# AGENTS.md

Principles and concrete rules for working in this repo. Setup, commands, and
the add-a-photo flow live in [`README.md`](./README.md) — not repeated here.

## Ethos

- **Simple.** A quiet portal to view photographs. Every addition is a tax
  against that quietness — the question for any change is "would removing this
  leave something missing?" If no, don't ship it.
- **Boring stack, no dependencies unless forced.** Astro + plain CSS + markdown
  is correct *because* it's boring. A 20-line script beats a dependency. Don't
  fight the framework — use content collections, `getStaticPaths`, `<Image>`.
- **No premature abstraction.** Duplicate three times before extracting. The
  wrong abstraction is more expensive than repetition.
- **The site is the photographer's filing system and log book.** Structure bends
  with the practice — schema, routes, and categories evolve as his
  organizational instincts do. Each photo is a dated entry (made, added, camera,
  film, place, reflection), not a product page.
- **Declined by default:** CMS, comments, analytics, search, custom build
  pipeline, microservices. Most feature ideas are best deferred.

## Tactile details

Small analog-process details — borrowed from making and printing photographs —
separate this from a generic gallery. They reward attention without demanding
it. Existing: pull-cord light switch (theme toggle), paper-grain overlay,
verso metadata treatment, print invert-to-negative button, format-grouped
series view.

When adding one, ask: is there a real-world analog? Rules:

1. Restraint over elaboration; never block interaction beyond ~400ms.
2. Honor `prefers-reduced-motion` — the site must work without animation.
3. No skeuomorphism for its own sake (paper grain = texture; wood-grain bg = cosplay).
4. CSS-first, no animation libraries.
5. Discoverable, not required — they supplement function, never replace it.

## Stack

- **Astro**, static output, content collections over a custom D1 loader.
  Every public page is prerendered and ships zero client JS; `/studio` is the
  only on-demand route. Keep it that way — see `docs/r2-d1-cms.md` for why
  going fully dynamic would be a bad trade on a site with no interactivity.
- **Cloudflare** D1 (metadata), R2 (images), Access (gates `/studio`), Workers AI
  (tag suggestions). No other services.
- **TypeScript** strict (Astro default) for any non-trivial JS.
- **Markdown** for the `notes` field only, rendered at build by the loader.
- **Plain CSS** in `src/styles/global.css` — no Tailwind, no CSS-in-JS, no
  preprocessors. CSS custom properties for design tokens.
- **System fonts** only (`system-ui`; mono for verso labels). No web fonts.

## Content model

Metadata lives in Cloudflare D1, images in R2. Schema:
`migrations/0001_init.sql` (tables) and `src/content.config.ts` (the Zod shape
the site reads through).

```
D1 photos / series / photo_tags   ← metadata, edited at /studio
R2 photos/<id>/<hash>.<ext>       ← images, content-addressed
```

These are the only copies. Content is not mirrored into git: D1 Time Travel covers
metadata for 30 days, and images have no safety net beyond your own scans.

Photo ids are still 6-char lowercase hex hashes (e.g. `a3f4c1`): stable forever,
no implied ordering, no collisions across parallel scans. Ordering comes from
`added`, never the id.

- Required: `added`, `alt`, `image_key`.
- Optional: `date`, `caption`, `camera`, `film`, `location`, `format`, `series`,
  `notes`, `width`/`height`, tags.
- `published` is a column, and it is the one thing the old model did better —
  a directory move was self-evident where a flag is not. It exists because
  moving a row isn't a thing. The public build selects `published = 1` only, so
  drafts are still genuinely absent from the site rather than hidden by CSS.
- `added` — stamped at upload; drives newest-first sorts. `date` — when the
  shutter clicked; display only, optional granularity.
- `caption` — one short label line in `<figcaption>`. `notes` is markdown,
  rendered at build by the loader's `renderMarkdown()` → the **Notes** section.
- Image keys are content-addressed (`sha256` prefix), so every URL is immutable
  and cacheable forever, and re-uploading never needs a cache purge.

Two paths reach the same database, because builds run outside the Worker:
`src/loaders/d1.ts` (REST API, build time) and `src/lib/studio.ts` (the `DB`
binding, /studio only).

No helper scripts. `/studio` is the interface; if something feels repetitive,
it belongs there, not in a `scripts/` directory.

## Tagging

Lowercase strings, kebab-case for multi-word, any number including zero.
Written by hand at /studio while writing notes. Tags create implicit views
(`/tags/`, `/tags/<tag>/`).

Suggestions come from a vision model via the Workers AI REST API. This replaced
the local Florence-2/transformers.js tagger, which cannot run on Workers — a real
loss: tagging is no longer offline or API-free. Bound as a REST call rather than
the `AI` binding on purpose, since binding Workers AI forces every build into a
remote proxy session. **Suggestions only — never written to tags automatically.**
You decide what a photograph means.

## Routing & views

Routes are listed in README. Constraints:

- Resist adding views — a darkroom doesn't have ten ways to view one print. If a
  need shows up ("by year", "by camera"), add it as a section in an existing
  view before adding a route.
- Mosaics appear only on `/gallery/` and `/tags/<tag>/` (tags are inherently
  cross-cutting). Series views group by format, largest first, then newest.
- **Verso treatment:** per-photo metadata renders small/uppercase/monospace/faint
  like pencil notes on the back of a print. Formats use `×` not `x` (`6×7`).

## Series

Rows in the D1 `series` table. Required: `title`. Optional: `description`,
`cover` (a photo id), `sort_order`. A photo joins by its `series` column matching
a slug. No series is fine (still in `/gallery/` + permalink).

Naming a series that doesn't exist yet is how you start one: saving a photo with
an unknown slug creates it, titled from the slug (`north-shore` → "North Shore").
The studio's series field is a `<datalist>` combobox — pick an existing one or
type a new slug.

## Styling rules

- Semantic elements (`main`, `header`, `figure`, `figcaption`, `dl`).
- Flexbox/block flow; grid only for genuine 2D alignment.
- One page measure (`--measure` in `:root`).
- No hardcoded colors — reference CSS variables. Darkroom palette: warm
  off-white / warm near-black, no pure RGB, no accent color (state via
  underline/weight/border).

## What NOT to do

- No build steps beyond `astro build`.
- No analytics, trackers, or cookie banners.
- Don't add `prerender = false` to a public route. `/studio` is the exception,
  not a precedent.
- Don't put secrets or writable bindings anywhere a public page can reach them.
- Don't bind Workers AI in `wrangler.jsonc` — it has no local emulation and
  forces builds into a remote proxy session. Call the REST API.
- No client-side JS frameworks unless a feature truly needs interactivity beyond
  `<details>`, anchor links, or a few lines of vanilla JS.
- No commented-out code; no TODO comments without an issue.

## Image handling

Images live in R2, uploaded through `/studio`, served from a custom domain
through Cloudflare Images transformations. Keep sources ~3000–4000px long edge,
quality ~85; the studio rejects anything over 25 MB.

`<Image />` and `astro:assets` are **not** used for photographs — sharp can't run
on Workers, and the build no longer has the files locally. Use the helpers in
`src/lib/images.ts` (`photoImg`, `photoSrc`, `photoSrcset`) instead, which build
`/cdn-cgi/image/` URLs. `PUBLIC_IMAGE_TRANSFORM=0` bypasses transformations and
serves originals — the escape hatch if Images isn't enabled on the zone.

Intrinsic `width`/`height` are captured in the browser at upload and stored, only
to reserve layout space. They're optional; absent just means possible layout
shift.

## Deferred (not now)

Print sales (Stripe, once the catalogue justifies it), homepage shape (sit with
the single-featured-photo `/` for ~10 real posts before reconsidering).

Content management moved to D1 + R2 with a `/studio` UI — the design record and
the reasoning, including which objections turned out to be wrong, is in
[`docs/r2-d1-cms.md`](./docs/r2-d1-cms.md).
