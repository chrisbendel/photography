# photography

Personal photography site. Astro, plain CSS, deploys to Cloudflare Pages.

Ethos and content model: [`AGENTS.md`](./AGENTS.md).

## Setup

```sh
yarn install
```

## Commands

| Command | What it does |
| --- | --- |
| `yarn dev` | Dev server at `localhost:4321` |
| `yarn build` | Build to `./dist/` |
| `yarn preview` | Preview the production build |
| `yarn new-photo <image> [--no-tags]` | New draft entry in `archive/` (auto-suggests tags) |
| `yarn publish <id>` | Promote `archive/<id>/` → live |
| `yarn check-photos` | Lint live photos: alt text, sizes, refs |
| `yarn suggest-tags <slug>\|--all` | Re-tag existing photos |

## Adding a photograph

1. **Scan** → JPEG, long edge ~3000–4000px, under 3 MB.
2. **Scaffold** — `yarn new-photo path/to/scan.jpg`. Creates `archive/<id>/` and writes tag suggestions as comments in the frontmatter.
3. **Fill frontmatter** — `alt` (required), camera, film, format, location, optional caption/series. Move any suggested tags you like into `tags:`.
4. **Write the notes.** What you saw, remember, learned. The point of the project — don't rush.
5. **Preview** — `yarn dev`, walk `/photos/<id>/` and the gallery.
6. **Publish** — `yarn publish <id>`, then `yarn check-photos`, commit, push. Cloudflare rebuilds.

Tags come from a local vision model (Florence-2 via transformers.js) — no API, offline after the first run downloads the model. Suggestions only; never written to `tags:` automatically.

## Routes

- `/` latest published photograph
- `/gallery/` every print, with loupe view
- `/series/` and `/series/<slug>/`
- `/photos/<slug>/` single print permalink
- `/tags/` and `/tags/<tag>/`
- `/rss.xml` feed of every photograph
