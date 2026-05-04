# AGENTS.md

Guiding principles for any agent (human or AI) working in this repo.

## Project

Personal photography portfolio. Hosts selected scans of medium and large format
black & white film photographs. Static site, deployed to Cloudflare Pages.

## Ethos

- **Simple**. The site is a quiet portal to view photographs. Treat every
  addition as a tax against that quietness.
- **Plain HTML and typography**. Lean on semantic elements and the natural
  cascade. No design system. No component libraries.
- **Darkroom palette**. Warm Ilford-fiber off-white and deep warm black, never
  pure RGB extremes. Dark mode is warm near-black, no blue. No accent color —
  hover/focus states are conveyed by underline, weight, or border, not by a
  splash of red. One subtle paper-grain SVG overlays the whole page.
- **No dependencies unless necessary**. If a feature can be done with a few
  lines of CSS or vanilla JS, do that.
- **The site is also the photographer's filing system.** This is not just a
  public portal — it is the way the photographer organizes his own work. The
  layout, the schema, the routes, the categories all evolve as his
  organizational instincts evolve. If the way he thinks about a photograph
  changes (a new way of grouping, a new piece of metadata, a new view that
  helps him *find* something he made), the site changes to reflect that.
  Resist the urge to lock the structure in early. The structure is meant to
  bend with the practice.
- **And it is also a log book.** Each photograph is a dated entry —
  stamped with when it was made, when it was added, what camera, what film,
  where, and a written reflection. The site is the cumulative record of a
  practice over years. Read forward, you see what's new; read backward, you
  see how the work has changed. Treat each entry like an entry — not like a
  product page. Quiet, dated, complete, sequential.

## Grug-brained development

This project is built in the spirit of [the grug-brained developer](https://grugbrain.dev/).
A working translation, applied here:

- **Complexity is the demon.** Every dependency, every abstraction, every clever
  trick is a tax on future-grug. Refuse complexity loudly; pay it only when
  forced.
- **"No" is grug's most powerful word.** Each "yes" is permanent. This site does
  not need: a CMS, comments, an analytics dashboard, a search box that fights
  the existing tag pages, a custom build pipeline, image-recognition auto-tags,
  a microservice for anything. Most feature ideas are best declined or
  deferred.
- **Boring beats shiny.** Astro + plain CSS + markdown frontmatter is the
  correct stack precisely because it is boring. No bundler tweaks, no design
  system, no framework du jour. A 20-line script beats a dependency.
- **Avoid premature abstraction.** Duplication is cheap and reversible; the
  wrong abstraction is expensive and stuck. Repeat code three times before
  extracting a helper. (`src/lib/format.ts` was extracted only after Astro's
  `getStaticPaths` couldn't see module-level helpers — not because it might
  one day be reused.)
- **Hide complexity at the seams.** When something *does* get complex (e.g.
  the gallery loupe), keep it inside one file with one job. Don't sprawl.
- **Don't fight the framework.** Astro wants content collections,
  `getStaticPaths`, `<Image>`. Use those. Don't reinvent routing, don't build
  a homemade markdown parser, don't replace the asset pipeline.
- **Tests where the joints are.** No test framework yet. The
  `npm run check-photos` script is the only test that earns its keep —
  it catches publishing mistakes (missing alt, oversized images, orphan
  files). When a real bug class appears, write a test for *that*, not for a
  coverage target.
- **Closure beats novelty.** Finish what you start. Demo routes are allowed
  during exploration; they must be deleted once a direction is picked.
  Open loops accumulate weight.
- **Premature optimization is bad. Ignorant non-optimization is worse.** No
  need for a CDN, a service worker, or a Cloudflare Worker for 9 photos. Do
  need to keep image sizes in check (`scripts/check.mjs` warns past 3MB).
- **"We should rewrite this" is almost always wrong.** When the site feels
  broken, the answer is usually to delete code, not add a new layer.

The recurring question for every change: not "can we?" but "would removing
this leave something missing?" If no, don't ship it.

## Tactile details

The site is a quiet photo viewer first. Within that quiet, small tactile
details — borrowed from the analog process of making and printing
photographs — are what separate the site from a generic gallery template.
They reward attention without demanding it.

Existing details:

- **Pull-cord light switch** (nav). An Edison bulb on a cord. Pull it to
  flip the theme. Cord stretches, bulb dips and rebounds, halo blooms.
  Mirrors the actual fixture in the photographer's darkroom.
- **Paper-grain overlay**. A near-imperceptible noise SVG over the page,
  multiply-blended in light mode, screen-blended in dark. Page reads like
  fiber paper, not screen.
- **Verso treatment**. Per-photo metadata as small uppercase monospace —
  evokes pencil notes on the back of a print.
- **Print invert button**. A small overlay on the photo flips the scan to
  negative. Mirrors holding a real negative up to the light.
- **Format-grouped series view**. Prints sorted largest first within each
  series, mirroring how prints physically stack in a paper box.

When adding a feature, ask: is there a real-world analog to what this is
doing? If yes, can the interaction feel a little more like that real
thing — without becoming kitsch, slow, or skeuomorphic theater?

Rules:

1. **Restraint over elaboration.** A 0.4s animation that *suggests* an
   action beats a 2s animation that *performs* it.
2. **Never block the user.** Animations may not delay critical interaction
   beyond ~400ms total.
3. **Always degrade gracefully.** Honor `prefers-reduced-motion`. The site
   must function without animation.
4. **No skeuomorphism for its own sake.** Wood-grain page background = cosplay.
   Paper grain that disappears at normal viewing distance = texture.
5. **CSS-first.** If a tactile detail can be done with CSS animations and a
   few lines of vanilla JS, do that. Avoid libraries.
6. **Discoverable, not required.** A user who never notices the pull-cord
   still has a working theme toggle. Tactile details supplement function;
   they never replace it.

These small things, accumulated, are the work. They don't compete with the
photographs — they frame them.

## Stack

- **Astro** — static output, content collections.
- **TypeScript** — strict, the Astro default. Use it for any non-trivial JS.
- **Markdown** for photo entries (frontmatter + optional body). MDX only if a
  real need arises.
- **Plain CSS** in `src/styles/global.css`. No Tailwind. No CSS-in-JS. No
  preprocessors. Use CSS custom properties for the small set of design tokens.
- **System fonts** (`system-ui` sans stack). No web fonts. Utilitarian and
  legible on every screen, free on every OS. Mono kept for verso labels.

## Content model

Each photograph lives in its own folder under `src/content/photos/<id>/`,
where `<id>` is a zero-padded numeric directory name (`0001`, `0042`, …).
The folder contains its markdown (`index.md`) and image (`image.jpg`). The
markdown's `image:` field is a local relative path, `image: ./image.jpg`.
Schema is in `src/content.config.ts`.

```
src/content/photos/
  0001/
    index.md
    image.jpg
  0042/
    index.md
    image.jpg
```

The id for routing comes from the directory name (`/photos/0042/`). IDs are
monotonic — assigned by `new-photo` as `max(existing) + 1`. They are stable:
never renumber, leave gaps when a photo is deleted.

Why numeric ids: photographs don't need names. Naming each one is a tax on
posting. Sorting by id desc is the same as "newest added first" — no
`published` field needed. URLs become opaque (`/photos/0042/` vs
`/photos/morning-window/`) but this site is a personal log first; opaque
URLs are fine.

Why the per-folder layout: each photo is a self-contained package — drop the
folder, photo gone; share the folder, photo travels intact. Browsing
`src/content/photos/` shows one row per photograph (the id), not interleaved
markdown and JPEGs.

Required frontmatter: `image`, `alt`.
Optional: `date`, `caption`, `camera`, `film`, `location`, `format`,
`series`, `tags`.

There is no `draft` field. Adding an entry and pushing the commit *is*
publishing. Hold half-finished entries on a branch or in a stash, not in
the working tree on `main`.

### `date`

`date` is the day the photograph was *made* (shutter clicked). Display only —
shown on the permalink. Not used for sorting on `/` or `/gallery/` (id desc
handles that). Granularity is your call: `2024`, `2024-03`, or full
`2024-03-14` all parse. Optional — leave it off if you don't know.

### `caption` vs body

- `caption` (frontmatter) → rendered in `<figcaption>` directly under the
  image. Keep it to one short line. It is a label, not prose.
- Markdown body → rendered as the **Notes** section below the metadata. This
  is the place for reflection on the photograph: what you saw, what you
  remember, what you learned. No length limit. Write slowly. The point of
  this project is to slow down, not to ship.

## Workflow — adding a photograph

The site is git-managed. There is no admin UI and there will not be one.
Posting is intentionally a deliberate act.

```
1. Process the scan to a final JPEG (3000–4000px long edge, ~85 quality).
2. Run: npm run new-photo -- path/to/image.jpg
   (the script picks the next id, creates src/content/photos/<id>/ with
    index.md (stub) and image.<ext> copied from your scan)
3. Open src/content/photos/<id>/index.md, fill the frontmatter and write notes.
4. npm run dev — eyeball / and /gallery/ and /photos/<id>/.
5. npm run check-photos — validates alt text, image sizes, references.
6. git commit, git push.
7. Cloudflare Pages rebuilds and deploys automatically.
```

`npm run new-photo` with no image arg is fine too — it just creates the
markdown stub at the next id and tells you where to drop the image.
Useful when scribbling down ideas before you've finished the scan.

There is no draft step. If you scaffold an entry and aren't ready to ship,
hold it on a branch or stash; don't commit a half-baked entry to `main`.

### Helper scripts

- `scripts/new-photo.mjs` — scaffolds a new entry at the next available
  numeric id (zero-padded to 4). Creates a stub `index.md` and copies the
  image if provided.
- `scripts/check.mjs` — lints the photos directory. Warns about non-numeric
  directory names, missing alt text, oversized images (> 3 MB), unresolved
  image refs, and orphan images. Non-blocking by design — warnings only,
  never fails the build.
- `scripts/suggest-tags.mjs` — sends a photograph to a local Ollama vision
  model and prints suggested tags. Suggestion only, never writes to the file.
  See "Tagging" below.

If a step starts feeling repetitive, add it to a script. The goal is that
adding a photograph requires only writing — no clerical work.

## Tagging

Photographs can be tagged with arbitrary lowercase strings (kebab-case for
multi-word). Tags are written by hand, mostly while writing the notes —
they're whatever felt true when the photograph was made or edited.

```yaml
tags: ["light", "morning", "interior", "stillness", "brooklyn"]
```

A photograph can have any number of tags, including zero. Tags create
implicit views:

- `/tags/` — index of all tags with counts
- `/tags/<tag>/` — mosaic of photographs with that tag

### AI-assisted tagging (optional)

A local vision model can suggest tags for you to review. Output is *only* a
suggestion — the script never writes to your markdown.

**One-time setup:**

```sh
brew install ollama          # or download from https://ollama.com
ollama pull moondream        # ~1.7GB, fast. Or `llava:7b` for better quality.
```

The Ollama macOS app starts a local daemon at `http://127.0.0.1:11434` in
the background. You don't need an API key. Nothing leaves your machine.

**Usage:**

```sh
npm run suggest-tags -- 0042              # one photo by id
npm run suggest-tags -- --all             # every entry in src/content/photos/
```

The script reads the image, sends it (along with the title/caption/location
from the markdown for context) to the model, and prints something like:

```
  0042 ... done
    suggested: ["light", "interior", "morning", "wood-floor", "minimal", "stillness", "shadow", "brooklyn"]
```

You then copy what resonates into the `.md` file. The model is scaffolding,
not an editor. The whole point of this project is that *you* are the one
deciding what a photograph means.

**Why local Ollama and not a cloud API:** privacy, no key management, free,
offline, fits a static site that has no server. If you outgrow Moondream's
quality, swap to `llava:7b` or `qwen2.5vl:3b` via `OLLAMA_MODEL=llava:7b npm
run suggest-tags ...`.

## Image handling

- For now, images are checked into git under `src/content/photos/<id>/` and
  served through Astro's asset pipeline (`<Image />` from `astro:assets`).
  This gives responsive `srcset`, format conversion (avif/webp), and content
  hashing for free.
- Keep source files reasonable. A 3000–4000px long edge JPEG at quality ~85 is
  plenty for web.
- When the repo gets uncomfortable (rough rule: > 500 MB), migrate to
  Cloudflare R2 or similar object storage. Update the schema to accept a URL
  and write a small custom loader.

## Routing & views

The site borrows the metaphor of a darkroom shelf: a few labeled paper boxes,
each holding prints stacked by size. One front door, no view picker.

- `/` — **front door**. Each series rendered as a typographic paper-box label
  (uppercase title, small monospace stat line, italic description, tiny cover
  thumb). Stacked vertically with thin rules between. Click = open the box.

- `/series/<slug>/` — **open the box**. Stack of prints in that series,
  grouped by format (largest first: 4×5 → 6×7 → 6×6 → 35mm). Within each
  format group, newest first. Mirrors how prints physically stack in a paper
  box, sorted by size.

- `/gallery/` — **everything at a glance**. CSS-column mosaic of every
  non-draft photograph, mixed aspects packing naturally via `column-count` +
  `break-inside: avoid`. Click any thumb → permalink. The cross-cutting
  alternative to series — useful when you don't know which box something
  lives in.

- `/photos/<id>/` — **single print**. Permalink. Larger image, full
  metadata as a verso label, notes, tag chips. Used for sharing. The id
  is the numeric directory name (e.g. `/photos/0042/`).

- `/tags/` — index of every tag with a count.

- `/tags/<tag>/` — small mosaic of photographs with that tag. Cross-cutting
  alternative to series. The only place a mosaic appears, and only because
  tags are inherently cross-cutting.

### Verso treatment

Per-photo metadata (camera, film, format, date, location) is rendered like a
museum label or pencil notes on the back of a print: small, uppercase,
monospace, faint. In the in-stream views (series, tag) it's a single comma-
separated line. On the permalink it expands to a definition list with the
same monospace treatment. The format strings render with `×` not `x`
(`6×7`, `4×5`).

### When to add views

Resist adding more views. The constraint is the point — a darkroom doesn't
have ten ways to view the same print. If a need shows up (e.g. "by year" or
"by camera"), prefer adding it as a section within an existing view before
adding a new route.

## Series

Each series is a markdown file in `src/content/series/`. The schema is in
`src/content.config.ts`.

Required frontmatter: `title`, `cover` (id of a photo, e.g. `"0042"`).
Optional: `description`, `order` (for sorting on `/`).

A photograph joins a series by setting `series: <slug>` in its frontmatter,
where `<slug>` matches the filename of a series markdown file. A photo in no
series is fine — it simply won't appear on the front door, but it will still
appear in `/gallery/` and have a permalink.

The cover photo itself appears in the grid on `/`. Pick covers that *suggest*
the series rather than dominate it — the cover is a poster, not the
masterwork.

## Styling rules

- Use semantic elements (`main`, `header`, `footer`, `figure`, `figcaption`,
  `dl`).
- Layout with flexbox or basic block flow. Avoid grid unless the layout
  genuinely requires two-dimensional alignment.
- One `max-width` for the page measure (`--measure`), defined in
  `:root`.
- No hardcoded colors. Reference CSS variables.

## What NOT to do

- No build steps beyond `astro build`.
- No analytics, no trackers, no cookie banners.
- No client-side JS frameworks (React, Svelte, Vue) unless a feature genuinely
  needs interactivity that can't be done with `<details>`, anchor links, or
  a few lines of vanilla JS.
- No commented-out code. No "todo" comments without an issue.

## Future, not now

- Print sales — likely Stripe Checkout or a static integration. Defer until the
  catalogue justifies it.
- Custom domain — pick one when it picks itself.
- R2 for image hosting — only once git size hurts.

## Open questions

Decisions deliberately deferred — sit with them through real use, then revisit.

- **Homepage shape.** Currently `/` shows a single featured photograph
  (latest-published). Considered: a small grid of recent photos, a
  text-only "portal" listing sections, status quo. Sit with the single-photo
  approach for at least ~10 real posts before changing. The friction will
  name itself in actual use; right now it's just imagined.

## Hosting

Cloudflare Pages free tier is more than sufficient for a personal photo site.
Build output is `dist/`. Set the framework preset to "Astro" in the Pages UI;
build command `npm run build`, output directory `dist`.
