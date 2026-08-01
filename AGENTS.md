# AGENTS.md

Principles and rules for working in this repo. Setup, commands, and the
add-a-photo flow live in [`README.md`](./README.md).

## Ethos

- **Simple.** A quiet portal to view photographs. Every addition is a tax
  against that quietness — for any change, ask "would removing this leave
  something missing?" If no, don't ship it.
- **Boring stack, no dependencies unless forced.** A 20-line script beats a
  dependency. Don't fight the framework — content collections,
  `getStaticPaths`, `<Image>`.
- **No premature abstraction.** Duplicate three times before extracting.
- **The site is the photographer's filing system and log book.** Schema,
  routes, and categories bend with the practice. Each photo is a dated entry
  (made, added, lens, film, place, reflection), not a product page.
- **Declined by default:** CMS, comments, analytics, search, custom build
  pipeline. Most feature ideas are best deferred.

## Tactile details

Small analog-process details separate this from a generic gallery. Existing:
pull-cord light switch (theme toggle), paper-grain overlay, verso metadata
treatment, print invert-to-negative button, gallery loupe.

Adding one — is there a real-world analog? Then:

1. Restraint over elaboration; never block interaction beyond ~400ms.
2. Honor `prefers-reduced-motion`; the site must work without animation.
3. No skeuomorphism for its own sake (paper grain = texture; wood-grain bg = cosplay).
4. CSS-first, no animation libraries.
5. Discoverable, not required — supplement function, never replace it.

## Stack

Astro (static output, content collections), TypeScript strict, markdown photo
entries, plain CSS in `src/styles/global.css` with custom properties for tokens,
system fonts only. No Tailwind, CSS-in-JS, preprocessors, or web fonts.

## Content model

Schema: `src/content.config.ts`.

Every photo lives in `src/content/photos/<id>/`. There is no staging directory
and no publish step, because **git already is one**: the work happens locally on
a branch, everything is inherently a draft until it merges to `main`, and
opening a PR is the deliberate, visible act of publishing. A second staging
mechanism inside the repo only duplicates that, and buys a preview step that
can't preview.

So `yarn photo` writes straight into the collection and `yarn dev` renders it
immediately. `yarn check-photos` is the pre-merge gate, not a permission
boundary — it exits non-zero on empty alt.

Each photo is a folder named by a 6-char lowercase hex hash (e.g. `a3f4c1`)
holding `index.md` + `image.<ext>` (`image:` is relative, `./image.jpg`). Hash
ids are stable forever with no implied ordering and no collisions across
parallel scans; ordering comes from `added`, never the id.

- Required: `added`, `image`, `alt`.
- Optional: `year`, `caption`, `lens`, `film`, `location`, `format`, `series`, `tags`.
  The scaffold writes every one of them blank rather than commented out —
  filling a field in beats remembering it exists. `year` and `series` are
  `.nullish()` in the schema so a blank line is legal — `.optional()` only
  accepts undefined, and blank YAML is null.
- **No `draft` field and no staging directory.** A scaffold is schema-valid the
  moment it's written, so it can live in the collection unfinished without
  breaking the build. That's what `year`/`series` being `.nullish()` buys.
- `added` — machine-stamped at scaffold, drives newest-first sorts. `year` —
  when the shutter clicked, a plain integer. Not a date: film rarely remembers
  the month, and a number has no timezone to render wrong.
- `caption` — one label line in `<figcaption>`. Body markdown → **Notes**.

Scripts: `photo.mjs` (scaffold), `check.mjs` (pre-merge gate), `list.mjs`
(`yarn entries`), `suggest-tags.mjs`. Shared plumbing in
`scripts/lib/entries.mjs`. If a step feels repetitive, script it.

Hash ids are unreadable by design, so nothing else should be load-bearing for
finding an entry: `yarn photo` prints the absolute path plus a `code` command,
and `yarn entries` labels each hash with its caption, alt, or — before those
exist — the scan filename it was made from (`# scan:`). Scripts print commands
to run; they don't launch editors.

Reading frontmatter, match `^key:[ \t]*(.*)$` — never `\s*`. `\s` matches
newlines, so on a blank field it swallows the line break and captures the next
line's value. With every field now scaffolded blank, that is the common case.

## Tagging

Lowercase, kebab-case for multi-word, any number including zero. Written by hand
while writing notes. Tags create implicit views (`/tags/`, `/tags/<tag>/`).

A local vision model (Florence-2 via transformers.js) suggests tags in `yarn
photo`, or standalone via `yarn suggest-tags`. **Suggestions only — never
written to `tags:` automatically.** You decide what a photograph means.

Tuned for precision, not recall: three captions at increasing detail, ranked by
how many agree, capped at 7 (`TAGGER_MAX`). Aim for a handful worth keeping
rather than a long list to sift. If junk recurs, add it to `STOP` and re-run —
but prefer raising the bar over widening the blocklist.

Tags already used on the site score higher, and a candidate folds onto an
existing tag when they differ only by a plural (`rock` → `rocks`). The tag index
is only useful if one subject is one page, and this gets better as the
catalogue grows — the model doesn't know how this photographer talks, the
corpus does.

Model defaults to Florence-2-**large** at **q8** — smaller on disk than base at
fp32 (821 MB vs 1.0 GB) and materially better on black-and-white, which is the
whole catalogue. Override with `TAGGER_MODEL` / `TAGGER_DTYPE`.

Don't try to steer the model with a candidate vocabulary. `<OPEN_VOCABULARY_-`
`DETECTION>` isn't implemented in transformers.js, and
`<CAPTION_TO_PHRASE_GROUNDING>` grounds whatever you name — it returned
"elephant" and "spaceship" for a photo of a lake. Tested and rejected.

## Routing & views

- Resist adding views. If a need shows up ("by year", "by lens"), make it a
  section in an existing view before adding a route.
- Mosaics only on `/gallery/` and `/tags/<tag>/`. A series view is a single
  stack, newest first by `year` when set, `added` breaking ties — prints in a
  paper box, not a grid.
- **Verso treatment:** per-photo metadata renders small/uppercase/monospace/faint
  like pencil notes on the back of a print. Formats use `×` not `x` (`6×7`).

## Series

**A series is nothing but a name photographs share.** There is no series
collection and no files. `series: north-shore` in a photo's frontmatter creates
it, writing it again joins it, and the last photo to drop it removes it. The
page renders at `/series/north-shore/` titled "North Shore" from the slug.
That's why `series` is a plain `z.string()` and not a `reference()` — nothing to
point at, nothing to dangle, nothing to scaffold. All of it in
`src/lib/series.ts`, which is 45 lines.

Two consequences, both accepted knowingly:

- A typo quietly founds a series instead of erroring. `check-photos` catches it
  by edit distance — a slip is nearly always a near-miss of a name that already
  exists ("wintr" for "winter"), while a real new series looks nothing like the
  others. Numbered pairs (`winter-2025` / `winter-2026`) are exempt: identical
  once the digits come out. It also prints the roster with counts, and fails on
  a slug that isn't lowercase kebab-case, since the slug becomes a URL.
- A title is always the slug in Title Case, so `nyc` becomes "Nyc". If that ever
  matters, or a series wants a description, reintroduce a small collection
  merged in `getSeries()` — roughly 15 lines. Don't add it back before then; it
  was removed for contributing exactly nothing.

`yarn photo` pre-fills `series:` by scoring the suggested tags against what each
existing series already stands for (slug, title, description, and the tags of
its photos), needing at least two overlapping tags. Candidates come from photo
frontmatter as well as files, since most series won't have one. It only ever
names a series that already exists; founding one is a decision, not a suggestion.

## Styling

- Semantic elements (`main`, `header`, `figure`, `figcaption`, `dl`).
- Flexbox/block flow; grid only for genuine 2D alignment.
- One page measure (`--measure` in `:root`).
- No hardcoded colors. Darkroom palette: warm off-white / warm near-black, no
  pure RGB, no accent color (state via underline/weight/border).

## What NOT to do

- No build steps beyond `astro build`.
- No analytics, trackers, or cookie banners.
- No client-side JS frameworks unless a feature needs more than `<details>`,
  anchor links, or a few lines of vanilla JS.
- No commented-out code; no TODO comments without an issue.

## Image handling

Images live in git under `src/content/photos/<id>/`, served via `<Image />`.
Sources ~3000–4000px long edge, quality ~85, under 3 MB. Move to object storage
only once git size hurts (rough rule: > 500 MB).

## Deferred (not now)

Print sales (Stripe, once the catalogue justifies it), R2 hosting (once git size
hurts), homepage shape (sit with the single-featured-photo `/` for ~10 real posts
before reconsidering).

Browser-based CMS on R2 + D1, replacing the CLI: built and reverted (#5, #7).
Revisit only when you wanted to post and weren't at the laptop, the CLI has cost
real friction over ~10 posts, or hand-editing frontmatter starts feeling like
data entry past ~100 photos. Two objections raised against it were wrong and
shouldn't be reused: Cloudflare Images covers the resizing sharp does today, and
a custom content loader keeps `getCollection` and the Zod schemas intact. The
real costs are losing git as a free versioned backup, and dev no longer
rendering exactly what ships.
