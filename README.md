# photography

Personal photography site. Astro, plain CSS, deploys to Cloudflare Workers.
Conventions and rationale: [`AGENTS.md`](./AGENTS.md).

## Add a photograph

```sh
yarn photo ~/scans/011.jpg     # scaffold; Enter at the prompt opens it in $EDITOR
# fill in alt (required), year, lens, film, format, location, tags, notes
yarn dev                       # walk it at /
yarn check-photos              # must pass
# commit, open a PR, merge
```

Entries are live the moment they're scaffolded — the branch is the draft,
merging to `main` is publishing. To abandon one, delete the folder.

## Frontmatter

`yarn photo` writes the frontmatter with a comment above each field that needs
one, so the file explains itself. Every field is present and blank — fill in what
you know, leave the rest.

`notes` is one plain-text section — render under the print, searchable, no
markdown.

## Commands

| Command | What it does |
| --- | --- |
| `yarn dev` | Dev server at `localhost:4321` |
| `yarn build` | Build to `./dist/` |
| `yarn preview` | Build, then serve through wrangler |
| `yarn photo <image> [--no-tags]` | New entry, with suggested tags + series |
| `yarn entries` | List entries with a readable label per hash |
| `yarn check-photos` | Pre-merge gate (see below) |
| `yarn suggest-tags <slug>\|--all` | Re-tag an existing photo (~10s each) |

`check-photos` **fails** on empty alt; **warns** on images over 3 MB and orphan
files.

## Routes

| Route | |
| --- | --- |
| `/` | every print, loupe view, search (`?q=` filters; `/gallery` redirects here) |
| `/photos/<id>/` | single print |
| `/about/` | name, contact, colophon |
| `/series/`, `/series/<slug>/` | |
| `/rss.xml` | feed |

## Scanning

JPEG, long edge ~3000–4000px, quality ~85, under 3 MB.
