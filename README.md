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

Three tokens, one permission each, from **My Profile → API Tokens → Create Token
→ Custom token**. All are *Account* scoped — set Account Resources to your
account and leave Zone Resources alone.

| Env var | Permission | Goes where |
| --- | --- | --- |
| `CF_D1_TOKEN` | Account » **D1** » **Edit** | `.env`, GitHub secrets, Workers Builds vars |
| `CF_AI_TOKEN` | Account » **Workers AI** » **Read** | Worker secret only |
| `CLOUDFLARE_API_TOKEN` | Account » **Workers R2 Storage** » **Read** | GitHub secrets only |

`D1 → Edit` rather than `Read` because `migrate-to-d1` writes rows.

**`CLOUDFLARE_API_TOKEN` must not go in `.env`.** wrangler prefers it over your
`wrangler login` session, so a read-only R2 token there would break the
`r2 object put` calls in `yarn migrate-to-d1`. Locally, wrangler's own login
handles R2; the token exists so the backup Action can read objects in CI.

Keep them separate rather than combining. The `DB` and `BUCKET` bindings scope the
Worker to this one database and this one bucket, but token permissions are
account-wide — giving the Worker anything beyond Workers AI would let a bug in
`/studio` reach every D1 database and every R2 bucket in the account.

Where each one is read from:

- **`.env`** — `CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, `CF_D1_TOKEN`,
  `PUBLIC_IMAGE_BASE`, `PUBLIC_IMAGE_TRANSFORM`. Vite loads these into
  `import.meta.env` for the build; the node scripts get them via
  `node --env-file-if-exists=.env`.
- **Workers Builds → build variables** — the same five. The deployed build has no
  `.env`, and without them it builds an empty site rather than failing.
- **GitHub secrets** — `CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, `CF_D1_TOKEN`,
  `CLOUDFLARE_API_TOKEN`, for the nightly backup.

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
