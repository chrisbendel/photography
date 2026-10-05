# photography

Personal photography site. Astro, plain CSS, deploys to Cloudflare Workers.
How it works and why: [`AGENTS.md`](./AGENTS.md).

## Add photographs

```sh
yarn bench          # localhost:4331
yarn dev            # see it at localhost:4321
yarn check-photos   # must pass before merging
```

Drop scans onto the bench, one or a whole roll. Check each frame in **To do**,
then **Done** (⌘↩) files it on the **Sheet**. Commit, open a PR, merge: the
branch is the draft, and merging to `main` publishes.

## Commands

| Command | |
| --- | --- |
| `yarn bench` | Add and edit photographs at `localhost:4331` |
| `yarn photo <image>` | Add one from the terminal instead |
| `yarn entries` | Every entry, one line each |
| `yarn check-photos` | Fails on a missing alt; warns on big or stray files |
| `yarn suggest-tags <id>` | Re-read a photo with the vision model (`--all` for every one) |
| `yarn dev` | Dev server at `localhost:4321` |
| `yarn build` | Build to `./dist/` |
| `yarn preview` | Build, then serve through wrangler |
| `yarn deploy` | Build and deploy |

## Routes

| Route | |
| --- | --- |
| `/` | every print, loupe view, search (`?q=` filters; `/gallery` redirects here) |
| `/photos/<id>/` | single print |
| `/about/` | name, contact, colophon |
| `/series/`, `/series/<slug>/` | |
| `/rss.xml` | feed |

## Scanning

JPEG, long edge 3000–4000px, quality around 85, under 3 MB.
