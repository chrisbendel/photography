# photography

Personal photography site. Astro, plain CSS, deploys to Cloudflare Workers.

Content lives in Cloudflare D1 (metadata) and R2 (images), and is managed from
`/studio` rather than the filesystem. Public pages are still prerendered at build
time and ship zero JavaScript — only the source of the data changed.

Ethos and content model: [`AGENTS.md`](./AGENTS.md).
Design record for the move off markdown-in-git: [`docs/r2-d1-cms.md`](./docs/r2-d1-cms.md).

## Setup

```sh
yarn install
cp .env.example .env   # then fill in — the build reads D1 over its REST API
```

One-time Cloudflare provisioning is in [Provisioning](#provisioning) below.

## Commands

| Command | What it does |
| --- | --- |
| `yarn dev` | Dev server at `localhost:4321`, reading live D1 content |
| `yarn dev:worker` | Production build under `wrangler dev`, with `/studio` unlocked locally |
| `yarn build` | Build to `./dist/` |
| `yarn preview` | Preview the production build (`/studio` locked) |
| `yarn deploy` | Build and deploy |
| `yarn d1:migrate` | Apply `migrations/` to the remote database |
| `yarn d1:migrate:local` | Apply them to the local emulated database |
| `yarn export-to-git` | Back up D1 + R2 to markdown under `backups/` |
| `yarn migrate-to-d1` | One-time import of the old `src/content/photos/` folders |

## Adding a photograph

All of it happens at `/studio`, from any device that can sign in:

1. **Scan** → JPEG, long edge ~3000–4000px, under 25 MB.
2. **Drop it** on `/studio`. Creates a draft and takes you to its edit page.
3. **Fill the fields** — `alt` is required. Optionally hit *Suggest caption &
   tags* for a starting point; suggestions are never applied for you.
4. **Write the notes.** What you saw, remember, learned. The point of the
   project — don't rush.
5. **Publish.** Triggers a rebuild; live in a minute or two.

Drafts are invisible to the public site — the build only selects `published = 1`.

## Backups

Git is no longer the source of truth, so it's kept as a restore point instead.
`yarn export-to-git` regenerates the old markdown folder layout under `backups/`,
and [`.github/workflows/backup.yml`](.github/workflows/backup.yml) runs it nightly
and commits any change.

To restore: copy `backups/photos/` to `src/content/photos/`, and swap the D1
loader in `src/content.config.ts` back to a `glob()` loader.

## Provisioning

wrangler is a devDependency, not a global — run it as `yarn wrangler`.

```bash
yarn wrangler login
```

```bash
yarn wrangler d1 create photography
```

Put the printed `database_id` into [`wrangler.jsonc`](./wrangler.jsonc), then:

```bash
yarn wrangler r2 bucket create photography
```

```bash
yarn d1:migrate
```

Then, in the Cloudflare dashboard:

- **R2 → photography → Settings**: add a custom domain (e.g.
  `img.photos.cbendel.me`) and set it as `PUBLIC_IMAGE_BASE`.
- **Images → Transformations**: select the zone the custom domain sits under
  (`cbendel.me`) and enable transformations. Cloudflare only accepts source images
  from the same zone that serves the transformation, which is why the R2 custom
  domain has to be on this zone. Free tier covers 5,000 unique transformations a
  month; `PUBLIC_IMAGE_TRANSFORM=0` bypasses it and serves originals.
- **Zero Trust → Access → Applications**: add a self-hosted app covering
  `photos.cbendel.me/studio*`, policy = your email. Without this `/studio`
  returns 404 by design — the middleware fails closed.
- **Workers → Builds**: connect the GitHub repo so pushes deploy, and copy the
  deploy hook URL. Set the build-time variables from `.env`.

### API tokens

Two tokens, kept separate so the one the Worker can read stays minimal. Create
them under **My Profile → API Tokens → Create Token → Custom token**; all of
these are *Account* scoped.

| Token | Permissions | Used by |
| --- | --- | --- |
| `CF_D1_TOKEN` | D1 → Edit | The build's content loader (read), `migrate-to-d1` (write) |
| `CF_AI_TOKEN` | Workers AI → Read | `/studio` caption and tag suggestions |
| `CLOUDFLARE_API_TOKEN` | Workers R2 Storage → Read | The nightly backup Action, fetching images |

D1 → Edit rather than Read because `migrate-to-d1` writes rows. If you'd rather
scope the build tightly, make a second D1 → Read token for CI and keep Edit local.

Worker secrets — `DEPLOY_HOOK_URL` lets /studio trigger a rebuild, the other two
are for caption and tag suggestions:

```bash
yarn wrangler secret put DEPLOY_HOOK_URL
```

```bash
yarn wrangler secret put CF_ACCOUNT_ID
```

```bash
yarn wrangler secret put CF_AI_TOKEN
```

GitHub repo secrets, for the nightly backup: `CF_ACCOUNT_ID`,
`CF_D1_DATABASE_ID`, `CF_D1_TOKEN`, `CLOUDFLARE_API_TOKEN`.

## Routes

- `/` latest published photograph
- `/gallery/` every print, with loupe view
- `/series/` and `/series/<slug>/`
- `/photos/<slug>/` single print permalink
- `/tags/` and `/tags/<tag>/`
- `/rss.xml` feed of every photograph
- `/studio` and `/studio/<id>/` — content management, gated by Cloudflare Access,
  the only routes rendered on demand
