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

Scripts: `photo.mjs` (scaffold), `bench.mjs` + `bench/` (the bench),
`check.mjs` (gate), `list.mjs` (`yarn entries`), `suggest-tags.mjs`. Shared
plumbing in `scripts/lib/entries.mjs`, which owns the frontmatter template and
the in-place field writer so the CLI and the bench cannot drift apart.

## The bench

`yarn bench` is the CLI with eyes: one page on `127.0.0.1:4331`, thumbnails
of every frame down the left, the selected entry's fields on the right. It writes
`src/content/photos/<id>/index.md` through the same template `yarn photo` uses,
and nothing else.

It exists because two pains have no terminal answer. Hash ids are unreadable by
design, so *choosing* which entry to edit wants a picture. And free text drifts:
at 13 entries `lens` held seven strings for four lenses (`Fujinon W 250mm f/6.7`
against `Fujinon W 250 f/6.7`; `Schneider 360mm Tele-Xenar f/5.5` against
`Schneider Tele-Xenar 360mm f/5.5`; the Super Angulon with and without its
"Super"), `location` had Delta Park under two spellings, and `film` had `4x5` in
it. So `lens`, `film`, `format`, `location` and `series` are searchable
dropdowns (`combo.js`). Focus shows every value the collection already holds,
typing narrows them, and a value not in the list is marked "New" and saved as
typed. A value that matches an existing one except for capitals saves as the
existing spelling. Not a `<datalist>`: its popup can't be styled, and it hides
the list until you type, when seeing the other choices is the point. A value is typed once, ever. Suggestions are ordered most used
first, except location, which goes a→z: there are many, and you look one up
by name.

Lens strings read maker, series name, focal length, aperture — `Caltar II-N 210mm
f/5.6`. Four lenses, four strings: don't re-split one on a spelling. A near-match
in the suggestions is drift, not a second lens.

**This is not the CMS that was reverted** (#5, #7). No object storage, no D1, no
auth, no second render path: git is still the versioned backup, and `yarn dev`
still renders exactly what ships. Close the process and nothing is left running.

Its security model is two things, and it needs both. It binds `127.0.0.1`, never
`0.0.0.0` — don't put it behind a tunnel or "just" bind it wider. And `forbid()`
checks `Host`, `Origin` and `content-type` on every request, because binding
alone does **not** make it unreachable: localhost is reachable from every page
the browser has open. A `text/plain` body is a CORS-simple request, so it needs
no preflight — before the guard, a `POST /api/entries` with `text/plain` and
`Origin: https://evil.example` returned 201 and wrote an entry to disk. Writes
now require `application/json`, which forces a preflight nothing answers; a
foreign `Origin` is refused; and a foreign `Host` is refused so a domain
resolving to 127.0.0.1 can't pose as same-origin. Plain GETs send no `Origin`,
so the page, the stylesheet and the thumbnails are untouched.

A frame is only ever in one of two places. **To do** is what came in
and isn't finished. **Sheet** is everything else. Both use the same layout: the
print in the middle, its fields on the right, and that place's frames in a strip
underneath. In To do the button is **Done** (⌘↩). It saves the frame, files it
on the sheet, and opens the next frame on the roll. ⌘S saves without filing,
for a frame you mean to come back to. On the sheet the button is plain Save.
Arrow keys walk the strip. The to-do list, and the model's readings of frames
not yet opened, are held in `localStorage`, so a reload does not lose your place.

Gaps are found on the Sheet, not in a separate workflow. Next to the filter,
one chip per field that some saved frame is missing, such as "no location · 12".
The fields are alt, year, format, lens, film, location and tags. Caption and
notes may well be blank, and series has its own place. A chip narrows the strip
to those frames and opens the first. Saving a frame that fills the gap moves it
out of the strip and opens the next, caret in that field. That is the same rule
as Done: a write that takes a frame out of the strip makes way for the next.

A roll comes off the scanner as a batch, so a drop of several files is one too.
Before anything is written, the bench asks once for what the frames share
(format, film, lens, location, year, series, tags). It stamps them on every
entry it creates, in filename order, which is roll order. A single file skips
that step. Either way, new frames land in To do. The model reads one frame at a
time, the frame on screen first. Every reading lands the same way. `alt` and
`scene` go to disk if they are blank there, as `yarn photo` writes them, so a
frame is never left without alt. The rest of the reading waits for the form:
its tags, and its alt if you have already typed your own. The form takes it
straight away if the frame is open, or whenever you open it. This is not bulk
edit. The shared fields apply only when
the entries are created. After that, every frame is edited on its own.

Delete removes the frame's whole folder, after a confirm. It arrived with
batches: a roll has duds, and removing one should not mean leaving the bench to
find a hash in the file tree. Git is the only undo, and only for committed
frames. A frame from tonight's batch is gone for good, though the scan it came
from is still wherever you dropped it from.

Keep it dumb. It has no reorder, no bulk edit and no preview of the site — the
collection and `yarn dev` already do those. If it ever needs
a build step or a framework, that is the signal it has outgrown its brief, not a
reason to add one.

**How the bench should feel.** Check every UI change against these. Add to them
as the bench teaches you something.

1. **The print first.** It gets the most room. Everything else stays quiet
   around it.
2. **Places never mix.** Where a frame sits, in To do or on the Sheet, is its
   state. It needs no badge to say so. Series is a third place for groups, not
   a state, and a message said in one place is cleared on leaving it.
3. **One obvious next step.** Each state has one filled button: Add, Done or
   Save. Other actions are outlined (Cancel, Add photographs) or plain text
   (Read again, Delete, the light).
4. **Say it once.** No label, count or sentence repeats what is already on
   screen. The tab holds the count, so the strip doesn't.
5. **Name, don't instruct.** A label is the field's name. Hints go in
   placeholders and tooltips, and a placeholder never looks like a value. An
   empty Lens showing "Caltar II-N 210mm f/5.6" reads as set. Prose is only for
   empty states and errors.
6. **Ask only before loss.** Confirm only before throwing away typing, and
   before Delete. Nothing else interrupts.
7. **The loop stays on the keys.** ⌘↩ Done, ⌘S Save, ← → walk the strip. Done
   puts the caret in the next frame's alt. Tooltips show the keys, but the
   mouse never needs them.
8. **The site's paper.** Use global.css tokens, verso labels, and underlines
   instead of boxes. Add no new visual language.
9. **Remove before adding.** A control earns its place by being used most
   sessions. Anything rarer goes quiet or behind a disclosure.

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
founding one, and the bench's **Series** place is where it's made.
- **Layout.** The strip holds the series, each with its newest frame as a cover.
  The stage shows the open series in the order /series/ will, with a Remove on
  each frame. The panel searches every other frame, and a click adds one.
- **One series per photo.** Adding a frame from another series moves it, and
  the picker shows which series it would leave.
- **New series.** Naming one opens it empty. It exists once a frame is added,
  the same as anywhere else.
- **Rename.** This rewrites `series:` on every member, one write each. Renaming
  onto an existing name merges the two, so it asks first. The slug is the URL,
  so the old `/series/<slug>/` stops working, and the status line says so.

The per-frame form doesn't show Series, so it has one home. A roll can still
take one as a shared field, since a roll is often a series. Offering what
exists is not guessing from it.

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
location, lens, film, format, year, series, notes — plus `scene`, the vision model's
full description, written by `yarn photo` and never rendered. `scene` is what
makes "island" or "overcast" find a frame nobody thought to tag that way, and it
is why search quality doesn't depend on tagging discipline. Backfill it on an
old entry with Read again on the bench, which fills a blank `scene`.

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
  agree, capped at 7 (`TAGGER_MAX`) and floored at 6 (`TAGGER_FLOOR`). Below the
  floor a word was named in one caption only and is not already a site tag, so
  four honest tags ship instead of seven padded with noise. Raise the floor
  before widening `STOP` — that is the lever.
- Tags already on the site score higher, and candidates fold onto an existing tag
  by plural (`rock` → `rocks`). One subject, one page.
- **The mood sentence is cut, not scored.** Florence-2 closes nearly every
  caption with "the overall mood of the image is peaceful and serene", and often
  a sentence on where the camera stood. Both are boilerplate: they appear on
  almost every frame, so they separate none of them. `frame()` strips them from
  the caption before anything reads it, which keeps them out of the tags *and*
  out of `scene`. It used to be worse than neutral — a `MOOD` set gave those
  words a +2 bonus, and "peaceful and serene" was suggested on 11 of 13 photos.
  A mood word used descriptively ("the water appears calm") still survives, and
  that is the distinction worth keeping.
- **`CLIMATE` words are never suggested, and are cut from `alt`.** In monochrome
  the model reads any smooth bright region as snow or ice: it called a
  long-exposure river a "frozen lake" in all three captions (`fc75e1`), so
  caption agreement cannot tell the two apart — a 3-of-3 gate was tried and it
  passes. A season is one word and you know it; type it. This matters most in
  `alt`, which is written to the file and read by the one person who can't check
  it against the print.
- Measured over the 13-photo catalogue, the two rules above moved suggestions
  that match a tag actually chosen from 50/91 to 48/75 — fewer tags, more of
  them right. Re-measure the same way before changing the scoring again: cache
  the three captions per photo once, then iterate the ranking offline.
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

The bench's page lives in `scripts/bench/`: markup in `index.html`, layout in
`bench.css`, and plain ES modules that the browser loads as they are. There is
no bundler. Read them in import order: `store` (state, the server), `view` (places, stage,
strip, and drawing the Series place), `combo` (the searchable dropdown),
`fields` (the inputs), `entry` (what is open, and Save, Done and Delete),
`series` (adding, removing, renaming), `reader` (the vision queue), `intake`
(files in), `main` (wiring).
Imports only point back down that list, so there are no cycles. `bench.mjs`
serves those files by bare name only, so no request path can leave the folder.
The page links `src/styles/global.css`, served alongside `grain.svg`, and adds
only the layout the site has no equivalent for. It declares no palette and no type scale of its own, so it cannot
drift. Controls borrow the nav search field's treatment — underline, not a box,
thickening on focus by shadow so nothing shifts — and labels borrow the verso
metadata idiom. The layout is a light table, not a page: the window is the
frame, so the fields pane and the strip scroll on their own. This is the one
place nested scrollers are right, because the print must stay in view while you
type. It is built for a laptop screen; there is no narrow layout. `min-width: 0`
on the stage is load-bearing: a form control's intrinsic width otherwise pushes
the row past the viewport, the same trap the nav documents.

Light/dark on the bench is a plain button. It uses the same `theme` key name as
`Layout.astro`, but not the same storage: `localStorage` is per origin, and the
bench (port 4331) and `yarn dev` (port 4321) are different origins. So a choice
on one does not carry to the other. The OS preference seeds both. **Don't port
the pull-cord to it** — that
is 200 lines of SVG and CSS scoped inside `Nav.astro`, and a copy drifts the
first time the cord is tweaked. The cord is a tactile detail for a visitor; the
bench is a tool.

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
The UX half of what it was for now lives in the bench above, at none of its cost.
Revisit only if you wanted to post away from the laptop, the CLI has cost real
friction over ~10 posts, or frontmatter starts feeling like data entry past ~100
photos. Two objections against it were wrong and shouldn't be reused: Cloudflare
Images covers what sharp does today, and a custom loader keeps `getCollection`
and the Zod schemas intact. The real costs are losing git as a free versioned
backup, and dev no longer rendering exactly what ships.
