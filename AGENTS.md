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
- **Declined by default:** CMS, comments, analytics, custom build pipeline.

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
| `image`, `alt` | required; `alt` is machine-written at scaffold — skim it |
| `year` | integer, not a date — film rarely remembers the month, and a number has no timezone to render wrong |
| `series` | a slug; naming one creates it |
| `caption`, `lens`, `film`, `location`, `format`, `tags` | optional |
| `notes` | the log book — plain text, renders under the print, searchable |

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
- Hash ids are unreadable by design — stable forever, so permalinks never rot.
  Finding an entry by name is the IDE's job, not a script's.
- `yarn photo` ends by offering to open the entry: Enter opens it in
  `$VISUAL`/`$EDITOR` (falling back to `code`), anything else prints the command.
  Copying a path out of scrollback was the one place the CLI cost real friction.
  The rule it replaces still holds everywhere else — scripts print commands, they
  don't launch things, and this one only prompts when `stdin` is a TTY, so piped
  and CI runs still just print.

Scripts: `photo.mjs` (scaffold), `check.mjs` (gate), `list.mjs` (`yarn
entries`), `suggest-tags.mjs`. Shared plumbing in `scripts/lib/entries.mjs`.

## Series

**A series is nothing but a name photographs share** — no collection, no files.
`series: north-shore` creates it, writing it again joins it, the last photo to
drop it removes it. Renders at `/series/north-shore/`, titled from the slug.
That's why `series` is a `z.string()`, not a `reference()`: nothing to dangle.
See `src/lib/series.ts`.

Consequences, accepted knowingly:

- A typo founds a series instead of erroring. Nothing checks for this on
  purpose — write the slug carefully; `yarn entries` shows what each photo is
  in. Slugs become URLs, so keep them lowercase kebab-case.
- Titles are always the slug in Title Case, so `nyc` → "Nyc". If that matters, or
  a series wants a description, reintroduce a small collection merged in
  `getSeries()` (~15 lines). Not before — it was removed for doing nothing.

`yarn photo` leaves `series:` blank, always. Joining one is a decision, same as
founding one.

It used to guess, scoring the suggested tags against each existing series' slug
and pooled member tags (2 overlaps to win). Don't reinstate that: the score grew
with membership, so the largest series always won. At 10 entries `winter` had
absorbed `water, trees, rocks, lake, river, sky, calm` — plus `spring`, from a
member tagged that way — and matched 6 of 7 unrelated photos, while `water`
appeared in 8 of 10 entries on its own. Tag overlap measures "both are Vermont
landscapes", not "both are winter". Anything that scores series from shared tags
needs the tags to be *distinctive*, which these aren't.

## Search

One field in the nav; `/` filters its own mosaic as you type, and the query lives
in `?q=` so a result set is a link. There are no `/tags/` pages — a tag on a
photo links to `/?q=<tag>`, so tags feed search rather than owning routes.

Matching is plain substring over everything a photo carries: tags, alt, caption,
location, lens, film, year, series, notes — plus `scene`, the vision model's
full description, written by `yarn photo` and never rendered. `scene` is what
makes "island" or "overcast" find a frame nobody thought to tag that way, and it
is why search quality doesn't depend on tagging discipline. Backfill it on an
old entry by copying the caption from `yarn suggest-tags <id>`.

The index is inlined per build — no fetch, no dependency, no search service. At
a few hundred photos that's still a small page; past that, move it to a JSON
file before reaching for a library.

## Tagging

Lowercase, kebab-case, any number including zero. Tags are search terms, not
routes.

A local vision model (Florence-2 via transformers.js) runs in `yarn photo` and
`yarn suggest-tags`. **Tags are suggestions only — never written to `tags:`
automatically.** `alt` and `scene` are the exceptions and *are* written: a blank
`alt` is an accessibility bug, and a machine sentence beats the empty string you
meant to come back to.

Skim the `alt` it writes. It is confidently wrong sometimes — it called a
lakeshore at Grand Isle "a river winding through a forest" — and unlike a bad tag,
a wrong `alt` misinforms the one reader who can't check it against the image.

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
- Mosaics only on `/`. A series is a single stack, newest
  first by `year` then `added` — prints in a paper box, not a grid.
- Above-the-fold prints load `eager` with `fetchpriority="high"` on the first —
  the mosaic is the LCP element, and lazy-loading it costs a round trip before
  anything paints. Everything below stays `lazy`.
- **Verso treatment:** per-photo metadata renders
  small/uppercase/monospace/faint, like pencil on the back of a print. Formats
  use `×` not `x`.

## Styling

- Semantic elements (`main`, `header`, `figure`, `figcaption`, `dl`).
- Flexbox/block flow; grid only for genuine 2D alignment.
- **One page measure** (`--measure`, 48rem), shared by nav and prose so nothing
  shifts width between pages; notes keep a shorter reading line inside it.
- **The mosaic is the one exception** (`--sheet`, 72rem, applied via
  `main:has(.sheet)`). Prints want room, prose doesn't. The consequence is
  accepted: the nav rule is narrower than the photographs under it, like a narrow
  header over a wide plate. Widen by *less* than this and it backfires — a third
  column at 64rem is 375px against the 412px two columns give inside `--measure`;
  at 72rem it's 423px, so the third column arrives at 1350px and not before.
- No hardcoded colors. Darkroom palette: warm off-white / warm near-black, no
  pure RGB, no accent color (state via underline/weight/border).
- `main` is a flex column with `gap: var(--gap)`. Don't also put margins on its
  children — they stack on the gap and double every space.

## Tactile details

Analog-process details that separate this from a generic gallery: pull-cord
light switch (theme toggle), paper-grain overlay, verso metadata, print
invert-to-negative button, gallery loupe, loupe glyph on the search field.

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
