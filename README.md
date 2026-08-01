# photography

Personal photography site. Astro, plain CSS, deploys to Cloudflare Workers.

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
| `yarn preview` | Build, then serve it through wrangler |
| `yarn photo <image> [--no-tags]` | New entry in `src/content/photos/<id>/` (auto-suggests tags + series) |
| `yarn entries` | List every entry, with a readable label per hash |
| `yarn check-photos` | Pre-merge gate: empty alt and bad series slugs fail; near-duplicate series, size and orphans warn |
| `yarn suggest-tags <slug>\|--all` | Re-tag existing photos (~10s each) |

## Adding a photograph

1. **Scan** → JPEG, long edge ~3000–4000px, under 3 MB.
2. **Scaffold** — `yarn photo path/to/scan.jpg`. Writes the entry, suggests tags and a series, prints a `code <path>` line to open it.
3. **Fill it in** — `alt` is the one that matters; then year, lens, film, format, location, caption. Move suggested tags you like into `tags:`. Write the notes in the body: what you saw, remember, learned. The point of the project — don't rush. Lost a hash? `yarn entries`.
4. **Ship** — `yarn dev` to walk it, `yarn check-photos`, then commit and push. Cloudflare rebuilds.

Entries render the moment they're scaffolded — `yarn dev` puts the new photo on
`/` straight away, since it sorts newest-`added` first. That's safe because the
branch is the draft: nothing reaches the site until a PR merges to `main`.
Abandoning one is `rm -rf` on the folder, or just not merging.

## Routes

- `/` latest published photograph
- `/gallery/` every print, with loupe view
- `/series/` and `/series/<slug>/`
- `/photos/<slug>/` single print permalink
- `/tags/` and `/tags/<tag>/`
- `/rss.xml` feed of every photograph
