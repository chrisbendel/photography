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
- **Monochrome**. Black, white, a few greys. No accent colors. Dark mode via
  `prefers-color-scheme` only.
- **No dependencies unless necessary**. If a feature can be done with a few
  lines of CSS or vanilla JS, do that.

## Stack

- **Astro** — static output, content collections.
- **TypeScript** — strict, the Astro default. Use it for any non-trivial JS.
- **Markdown** for photo entries (frontmatter + optional body). MDX only if a
  real need arises.
- **Plain CSS** in `src/styles/global.css`. No Tailwind. No CSS-in-JS. No
  preprocessors. Use CSS custom properties for the small set of design tokens.
- **System fonts** (`ui-serif` stack). No web fonts.

## Content model

Each photograph is a markdown file under `src/content/photos/`. The image lives
next to it (e.g. `sample.md` + `sample.jpg`). Schema is in
`src/content.config.ts`.

Required frontmatter: `title`, `date`, `image`, `alt`.
Optional: `caption`, `camera`, `film`, `location`, `format`, `draft`.

`draft: true` excludes the entry from the index and from `getStaticPaths`.

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
2. Run: npm run new-photo -- <slug> path/to/image.jpg
   (the script copies the image into src/content/photos/ and creates
    a markdown stub with draft: true)
3. Open src/content/photos/<slug>.md, fill the frontmatter and write notes.
4. npm run dev — eyeball both the reading view (/) and the contact sheet (/sheet).
5. Flip draft: false when you're ready to publish.
6. npm run check-photos — validates alt text, image sizes, references, and bodies.
7. git commit, git push.
8. Cloudflare Pages rebuilds and deploys automatically.
```

`npm run new-photo -- <slug>` (no image arg) is fine too — it just creates the
markdown stub and tells you where to drop the image. Useful when scribbling
down ideas before you've finished the scan.

### Helper scripts

- `scripts/new-photo.mjs` — scaffolds a new entry. Slug must be
  `[a-z0-9-]+`. Creates a stub with `draft: true` so half-finished entries
  never accidentally publish.
- `scripts/check.mjs` — lints the photos directory. Warns about missing alt
  text, missing titles, oversized images (> 3 MB), unresolved image refs,
  orphan images, and published entries with no body text. Non-blocking by
  design — warnings only, never fails the build.
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
npm run suggest-tags -- morning-window     # one photo
npm run suggest-tags -- --all              # every entry in src/content/photos/
```

The script reads the image, sends it (along with the title/caption/location
from the markdown for context) to the model, and prints something like:

```
  morning-window ... done
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

- For now, images are checked into git under `src/content/photos/` and served
  through Astro's asset pipeline (`<Image />` from `astro:assets`). This gives
  responsive `srcset`, format conversion (avif/webp), and content hashing for
  free.
- Keep source files reasonable. A 3000–4000px long edge JPEG at quality ~85 is
  plenty for web.
- When the repo gets uncomfortable (rough rule: > 500 MB), migrate to
  Cloudflare R2 or similar object storage. Update the schema to accept a URL
  and write a small custom loader.

## Routing & views

Three ways to see the work, deliberately. Each maps to how a photographer
actually thinks about their archive.

- `/` — **series grid (front door)**. A small grid of cover images, one per
  series. The curated entry point. Each cover links to that series' reading
  view. Loose photos (no series) do not appear here.

- `/series/<slug>/` — **per-series reading view**. The series treated as a
  small monograph: intro, then every photograph in that series stacked
  vertically with notes inline. Newest first.

- `/read/` — **global reading view**. Every non-draft photograph stacked
  vertically, newest first, with notes inline. The "everything top to bottom"
  view. Useful when you want to read all the work as one long thing.

- `/sheet/` — **contact sheet**. CSS-column mosaic of every non-draft
  photograph as thumbnails. Implemented with `column-count` +
  `break-inside: avoid` — true masonry without JS. Each thumb links to its
  permalink page. Discovery, not consumption.

- `/photos/<id>/` — **permalink** for a single photograph. Used for sharing.
  `<id>` is the filename without extension. If the photo belongs to a series,
  the page links back to that series.

### When to add views

Resist adding more views. The structure above already covers
*curated → series → linear → mosaic → single*. If a need shows up (e.g.
"by year" or "by camera"), prefer adding it as a section within an existing
view before adding a new route.

## Series

Each series is a markdown file in `src/content/series/`. The schema is in
`src/content.config.ts`.

Required frontmatter: `title`, `cover` (slug of a photo).
Optional: `description`, `order` (for sorting on `/`), `draft`.

A photograph joins a series by setting `series: <slug>` in its frontmatter,
where `<slug>` matches the filename of a series markdown file. A photo in no
series is fine — it simply won't appear on the front door, but it will still
appear in `/read/`, `/sheet/`, and have a permalink.

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

## Hosting

Cloudflare Pages free tier is more than sufficient for a personal photo site.
Build output is `dist/`. Set the framework preset to "Astro" in the Pages UI;
build command `npm run build`, output directory `dist`.
