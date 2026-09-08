# photography

Personal photography site. Astro, plain CSS, deploys to Cloudflare Workers.
Conventions and the reasoning behind them: [`AGENTS.md`](./AGENTS.md).

## Add a photograph

```sh
yarn photo-form     # bench at localhost:4331
yarn dev            # walk it at /
yarn check-photos   # must pass
```

Drop the scan onto the bench. It creates the entry, reads the image for `alt` and
tag suggestions, and offers the lenses, films, locations and series already in the
collection as dropdowns — so a value is typed once, ever. Cut what the model got
wrong, then Save. Every frame sits on the contact sheet beside the form, so
finding an old entry to edit is looking at it rather than recalling a hash.

Then commit, open a PR, merge. An entry is live the moment it exists: the branch
is the draft, merging to `main` is publishing. To abandon one, delete the folder.

The terminal path still works and writes the same file. `yarn photo
~/scans/011.jpg` scaffolds the folder and opens it in `$EDITOR`, every field
present and blank, with a comment over the ones that need one.

## Commands

| Command | What it does |
| --- | --- |
| `yarn photo-form` | The bench at `localhost:4331` — add and edit entries, see every frame |
| `yarn photo <image> [--no-tags]` | Same entry from the terminal (`series` stays blank) |
| `yarn entries` | One readable line per hash id |
| `yarn check-photos` | Pre-merge gate |
| `yarn suggest-tags <id>\|--all` | Re-read an existing photo (~10s each) |
| `yarn dev` | Dev server at `localhost:4321` |
| `yarn build` | Build to `./dist/` |
| `yarn preview` | Build, then serve through wrangler |
| `yarn deploy` | Build and deploy |

`check-photos` **fails** on empty alt; **warns** on images over 3 MB and orphan
files. The bench flags a frame with no `alt` on the sheet, for the same reason.

The bench binds `127.0.0.1` and writes only into `src/content/photos/`. No
database, no uploads, no auth. Close it and nothing is left running.

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
