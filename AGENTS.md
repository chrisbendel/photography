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
  organizational instincts do. Each photo is a dated entry (made, added, lens,
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

- **Astro**, static output, content collections.
- **TypeScript** strict (Astro default) for any non-trivial JS.
- **Markdown** for photo entries (frontmatter + optional body). MDX only if needed.
- **Plain CSS** in `src/styles/global.css` — no Tailwind, no CSS-in-JS, no
  preprocessors. CSS custom properties for design tokens.
- **System fonts** only (`system-ui`; mono for verso labels). No web fonts.

## Content model

Schema: `src/content.config.ts`.

```
src/content/photos/<id>/   ← published. Astro reads these.
archive/<id>/              ← scanned, unpublished. NOT in the build.
```

Each photo is a self-contained folder named by a 6-char lowercase hex hash
(e.g. `a3f4c1`), containing `index.md` + `image.<ext>` (`image:` is a relative
path, `./image.jpg`). Hash ids: stable forever, no implied ordering, no
collisions across parallel scans. Ordering comes from the `added` field, never
the id.

- Required frontmatter: `added`, `image`, `alt`.
- Optional: `date`, `caption`, `lens`, `film`, `location`, `format`, `series`, `tags`.
- **No `draft` field.** Live = published; unfinished entries stay in `archive/`.
- `added` — machine-stamped scaffold date; drives newest-first sorts. `date` —
  when the shutter clicked; display only, optional granularity.
- `caption` — one short label line in `<figcaption>`. Body markdown → the
  **Notes** section (reflection, no length limit).

Helper scripts: `photo.mjs` (scaffold in `archive/`), `publish.mjs`
(promote `archive/<id>/` → live, validates alt + image), `check.mjs` (lint
live photos — non-blocking warnings), `suggest-tags.mjs` (tag suggestions; see
below). If a step feels repetitive, add it to a script.

## Tagging

Lowercase strings, kebab-case for multi-word, any number including zero.
Written by hand while writing notes. Tags create implicit views (`/tags/`,
`/tags/<tag>/`).

A local vision model (Florence-2 via transformers.js) can suggest tags —
in-process, no API, offline after the first model download. Runs automatically
in `yarn photo` (suggestions written as frontmatter comments), or standalone via
`yarn suggest-tags <slug>|--all`. **Suggestions only — never written to `tags:`
automatically.** You decide what a photograph means.

## Routing & views

Routes are listed in README. Constraints:

- Resist adding views — a darkroom doesn't have ten ways to view one print. If a
  need shows up ("by year", "by lens"), add it as a section in an existing
  view before adding a route.
- Mosaics appear only on `/gallery/` and `/tags/<tag>/` (tags are inherently
  cross-cutting). Series views group by format, largest first, then newest.
- **Verso treatment:** per-photo metadata renders small/uppercase/monospace/faint
  like pencil notes on the back of a print. Formats use `×` not `x` (`6×7`).

## Series

Markdown files in `src/content/series/`. Required: `title`. Optional:
`description`, `cover` (a photo id), `order`. A photo joins via `series: <slug>`
matching a series filename. No series is fine (still in `/gallery/` + permalink).

Naming a series that has no file yet is how you start one: `publish.mjs`
scaffolds `<slug>.md` with a title inferred from the slug (`north-shore` →
"North Shore"), then you edit it. `check.mjs` warns on dangling refs from hand
edits.

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
- No client-side JS frameworks unless a feature truly needs interactivity beyond
  `<details>`, anchor links, or a few lines of vanilla JS.
- No commented-out code; no TODO comments without an issue.

## Image handling

Images checked into git under `src/content/photos/<id>/`, served via Astro's
asset pipeline (`<Image />`). Keep sources ~3000–4000px long edge, quality ~85,
under 3 MB (`check.mjs` warns past 3 MB). Migrate to R2/object storage only once
git size hurts (~rough rule: > 500 MB).

## Deferred (not now)

Print sales (Stripe, once the catalogue justifies it), R2 hosting (once git
size hurts), homepage shape (sit with the single-featured-photo `/` for ~10 real
posts before reconsidering).

Browser-based content management on R2 + D1, replacing the CLI: planned and
shelved, see [`docs/r2-d1-cms.md`](./docs/r2-d1-cms.md) for the design, the
corrected cost/effort assessment, and the conditions that would justify picking
it up.
