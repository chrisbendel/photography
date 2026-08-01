# AGENTS.md

Conventions and the reasoning behind them. Commands and the add-a-photo flow
live in [`README.md`](./README.md).

## Ethos

- **Simple.** A quiet portal to view photographs. For any change: would removing
  it leave something missing? If no, don't ship it.
- **Boring stack, no dependencies unless forced.** A 20-line script beats a
  dependency. Use content collections, `getStaticPaths`, `<Image>`.
- **No premature abstraction.** Duplicate three times before extracting.
- **The site is a filing system and log book.** Each photo is a dated entry, not
  a product page. Schema and routes bend with the practice.
- **Declined by default:** CMS, comments, analytics, search, custom build
  pipeline.

## Stack

Astro (static, content collections), TypeScript strict, markdown entries, plain
CSS in `src/styles/global.css` with custom-property tokens, system fonts. No
Tailwind, CSS-in-JS, preprocessors, or web fonts.

## Content model

Schema: `src/content.config.ts`. One folder per photo:
`src/content/photos/<id>/index.md` + `image.<ext>`, where `<id>` is a 6-char hex
hash — stable forever, no implied ordering, no collisions across parallel scans.

| Field | |
| --- | --- |
| `added` | required; stamped at scaffold, drives newest-first order |
| `image`, `alt` | required; `alt` must be non-empty (`check-photos` fails) |
| `year` | integer, not a date — film rarely remembers the month, and a number has no timezone to render wrong |
| `series` | a slug; naming one creates it |
| `caption`, `lens`, `film`, `location`, `format`, `tags` | optional |

**No `draft` field and no staging directory.** Git already is one: the branch is
the draft, merging to `main` is publishing. `yarn photo` writes straight into the
collection and `yarn dev` renders it immediately. `check-photos` is a pre-merge
gate, not a permission boundary.

Rules that are easy to break:

- The scaffold writes every field blank, not commented out. `year` and `series`
  are `.nullish()` so a blank line is legal — `.optional()` only accepts
  undefined, and blank YAML is null.
- Reading frontmatter, match `^key:[ \t]*(.*)$`, never `\s*`. `\s` matches
  newlines, so on a blank field it captures the next line's value.
- Hash ids are unreadable by design, so nothing else may be load-bearing for
  finding an entry: `yarn photo` prints a `code <path>`, `yarn entries` labels
  each hash. Scripts print commands; they don't launch editors.

Scripts: `photo.mjs` (scaffold), `check.mjs` (gate), `list.mjs` (`yarn
entries`), `suggest-tags.mjs`. Shared plumbing in `scripts/lib/entries.mjs`.

## Series

**A series is nothing but a name photographs share** — no collection, no files.
`series: north-shore` creates it, writing it again joins it, the last photo to
drop it removes it. Renders at `/series/north-shore/`, titled from the slug.
That's why `series` is a `z.string()`, not a `reference()`: nothing to dangle.
See `src/lib/series.ts`.

Consequences, accepted knowingly:

- A typo founds a series instead of erroring. `check-photos` catches it by edit
  distance, exempting numbered pairs (`winter-2025` / `winter-2026`), and fails
  on slugs that aren't lowercase kebab-case.
- Titles are always the slug in Title Case, so `nyc` → "Nyc". If that matters, or
  a series wants a description, reintroduce a small collection merged in
  `getSeries()` (~15 lines). Not before — it was removed for doing nothing.

`yarn photo` pre-fills `series:` only with a series that already exists, scoring
suggested tags against each one's slug and member tags (needs 2 overlaps).
Founding a series is a decision, not a suggestion.

## Tagging

Lowercase, kebab-case, any number including zero. Tags create `/tags/<tag>/`.

A local vision model (Florence-2 via transformers.js) suggests tags in `yarn
photo` and `yarn suggest-tags`. **Suggestions only — never written to `tags:`
automatically.**

- Precision over recall: three captions at increasing detail, ranked by how many
  agree, capped at 7 (`TAGGER_MAX`). Prefer raising the bar to widening `STOP`.
- Tags already on the site score higher, and candidates fold onto an existing tag
  by plural (`rock` → `rocks`). One subject, one page.
- Defaults to Florence-2 **large** at **q8** — smaller than base at fp32 (821 MB
  vs 1.0 GB) and much better on black-and-white, which is the whole catalogue.
  Override with `TAGGER_MODEL` / `TAGGER_DTYPE`.
- **Don't steer it with a candidate vocabulary.** `<OPEN_VOCABULARY_DETECTION>`
  isn't implemented in transformers.js, and `<CAPTION_TO_PHRASE_GROUNDING>`
  grounds whatever you name — it returned "elephant" for a photo of a lake.

## Routing & views

- Resist adding views. A new need ("by year", "by lens") becomes a section in an
  existing view before it becomes a route.
- Mosaics only on `/` and `/tags/<tag>/`. A series is a single stack, newest
  first by `year` then `added` — prints in a paper box, not a grid.
- **Verso treatment:** per-photo metadata renders
  small/uppercase/monospace/faint, like pencil on the back of a print. Formats
  use `×` not `x`.

## Styling

- Semantic elements (`main`, `header`, `figure`, `figcaption`, `dl`).
- Flexbox/block flow; grid only for genuine 2D alignment.
- **One page measure** (`--measure`, 48rem), shared by nav and content so nothing
  shifts width between pages. A mosaic gets room by shedding a column, never by
  widening the page; notes keep a shorter reading line inside it.
- No hardcoded colors. Darkroom palette: warm off-white / warm near-black, no
  pure RGB, no accent color (state via underline/weight/border).

## Tactile details

Analog-process details that separate this from a generic gallery: pull-cord
light switch (theme toggle), paper-grain overlay, verso metadata, print
invert-to-negative button, gallery loupe.

Adding one — is there a real-world analog? Then:

1. Never block interaction beyond ~400ms.
2. Honor `prefers-reduced-motion`; the site works without animation.
3. No skeuomorphism for its own sake (paper grain = texture; wood-grain = cosplay).
4. CSS-first, no animation libraries.
5. Discoverable, not required.

## Don't

- No build steps beyond `astro build`.
- No analytics, trackers, or cookie banners.
- No client-side framework unless a feature needs more than `<details>`, anchor
  links, or a few lines of vanilla JS.
- No commented-out code; no TODO without an issue.
- No images over 3 MB in git. Move to object storage only once the repo hurts
  (~500 MB).

## Deferred

Print sales (Stripe, once the catalogue justifies it). R2 hosting (once git size
hurts).

Browser-based CMS on R2 + D1, replacing the CLI: built and reverted (#5, #7).
Revisit only if you wanted to post away from the laptop, the CLI has cost real
friction over ~10 posts, or frontmatter starts feeling like data entry past ~100
photos. Two objections against it were wrong and shouldn't be reused: Cloudflare
Images covers what sharp does today, and a custom loader keeps `getCollection`
and the Zod schemas intact. The real costs are losing git as a free versioned
backup, and dev no longer rendering exactly what ships.
