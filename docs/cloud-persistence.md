# Cloud persistence deployment runbook

Cloud persistence is an optional Cloudflare Pages + D1 mode. The ordinary game
URL remains local IndexedDB play; only a `?save=` link uses the cloud service.

## Local cloud development

Use a separate local D1 database and a Git-ignored local admin key:

```bash
cp .dev.vars.example .dev.vars
# Edit .dev.vars and replace the example ADMIN_KEY.
npm run dev
```

`dev` applies the checked-in migrations to Wrangler's local D1 state, starts
Vite with hot reload for the browser app, and starts Pages Functions for API
requests. Open Vite's URL, then visit `/admin` and enter the same
`ADMIN_KEY` configured in `.dev.vars`. The local D1 state lives under
`.wrangler/` and is ignored by Git.

Use `npm run d1:migrate:local` by itself after adding a migration while the
local server is stopped. To start from an empty local database, delete the
ignored `.wrangler/` directory and run `npm run dev` again.

## 1. Create the D1 database

From this repository, authenticate with the Cloudflare account that owns the
Pages project, then create a database:

```bash
npx wrangler login
npx wrangler d1 create anki-adventure
```

Copy the returned `database_id` into `wrangler.toml`, replacing
`REPLACE_WITH_D1_DATABASE_ID`. Keep the binding name as `DB`: the Pages
Functions use that exact binding.

## 2. Apply the schema

Run each checked-in migration against the production database before the first
cloud release:

```bash
npm run deploy:db
```

For a local D1 test database, omit `--remote`.

The migrations create cloud saves, selected decks, published deck-card
memberships, and deck-scoped FSRS progress. Do not edit an applied migration;
add a new numbered migration instead.

## 3. Configure the admin secret

Choose a long, randomly generated admin key and set it as a Pages secret:

```bash
npx wrangler pages secret put ADMIN_KEY
```

Enter the value only when prompted. Do not add it to `wrangler.toml`, a `.env`
file committed to Git, browser storage, or a URL. The `/admin` page asks for
this key after every refresh and retains it only in memory.

## 4. Build and deploy

Verify both the browser application and Functions before deploy:

```bash
npm test
npm run build
npx wrangler pages functions build functions --outdir /tmp/anki-adventure-pages-functions
```

Deploy the Pages project using the same Cloudflare account. Pages discovers
the `functions/` directory automatically and uses the `DB` binding from
`wrangler.toml`.

```bash
npm run deploy:app
```

Use `npm run deploy` to apply the production D1 migrations first and deploy
the Pages app only if that succeeds.

For an existing Pages project, ensure its production environment also has the
`DB` D1 binding and `ADMIN_KEY` secret configured.

## 5. Private-beta smoke test

1. Open `/admin`, enter the admin key, and create a labeled cloud save.
2. Publish a small CSV deck with stable `id`, `front`, and `back` columns.
3. Open the newly shown share URL in a separate browser/device, select the
   deck in the Pack, complete one review, then reload.
4. Confirm the review schedule and party state persisted. Open the same link
   in a second tab, mutate one copy, then verify the other receives the
   reload-required message rather than silently overwriting it.
5. Rotate the link in `/admin` and verify the old link is rejected.

Cloud links are bearer credentials. Share them only with the intended learner,
and rotate a link immediately if it is exposed.
