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

## Add a photograph

```sh
yarn run new-photo -- field ~/Desktop/scan.jpg   # copies image, creates stub
# fill src/content/photos/field.md, write notes
yarn run check-photos                            # lint
# flip draft: false
git commit && git push                           # Cloudflare deploys
```

## Optional: AI tag suggestions

```sh
brew install ollama
ollama pull moondream
yarn run suggest-tags -- field
```

Local model. No API key. Suggestions only — never writes to your files.

## Routes

- `/` series grid
- `/series/<slug>/` series reading view
- `/read/` global reading view
- `/sheet/` contact sheet mosaic
- `/tags/` and `/tags/<tag>/` tag index + per-tag mosaic
- `/photos/<slug>/` permalink
