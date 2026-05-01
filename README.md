# photography

Personal photography site. Astro, plain CSS, deploys to Cloudflare Pages.

For ethos, content model, and detailed workflow, see [`AGENTS.md`](./AGENTS.md).

## Setup

```sh
yarn install
```

## Commands

| Command | What it does |
| --- | --- |
| `yarn dev` | Local dev server at `localhost:4321` |
| `yarn build` | Build static site to `./dist/` |
| `yarn preview` | Preview the production build locally |
| `yarn run new-photo -- <slug> [image]` | Scaffold a new photo entry (draft) |
| `yarn run check-photos` | Lint photos: alt text, sizes, refs, bodies |
| `yarn run suggest-tags -- <slug>\|--all` | Suggest tags via local Ollama (optional) |

## Adding a photograph — the ritual

Sit down, slow down. Eight boxes:

- [ ] **Process the scan.** Final JPEG, 3000–4000px long edge, ~85 quality.
- [ ] **Scaffold.** `yarn run new-photo -- <slug> path/to/scan.jpg`
      — creates `src/content/photos/<slug>/{index.md, image.jpg}` with `draft: true`.
- [ ] **Fill frontmatter.** Title, alt text, camera, film, format, location, optional caption / series / tags.
- [ ] **Write the notes.** The meditative part. What you saw, what you remember, what you learned. No length limit. This is the point of the project — don't rush.
- [ ] **(Optional) AI tag suggestions.** `yarn run suggest-tags -- <slug>` — local Ollama, copy whatever resonates into `tags: [...]`.
- [ ] **Eyeball it.** `yarn dev` → walk `/photos/<slug>/`, the gallery, and the relevant series page.
- [ ] **Publish.** Flip `draft: true` → `draft: false`.
- [ ] **Check + ship.** `yarn run check-photos`, then `git add . && git commit && git push`. Cloudflare rebuilds.

## Optional: AI tag suggestions

```sh
brew install ollama
ollama pull moondream
yarn run suggest-tags -- field
```

Local model. No API key. Suggestions only — never writes to your files.

## Routes

- `/` latest published photograph
- `/gallery/` mosaic of every print, with loupe view
- `/series/` list of series
- `/series/<slug>/` prints in a series
- `/photos/<slug>/` single print permalink
- `/tags/` and `/tags/<tag>/` tag index + per-tag mosaic
