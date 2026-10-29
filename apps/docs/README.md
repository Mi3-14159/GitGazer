# GitGazer Docs

Source of <https://docs.gitgazer.com/>, built with [Docusaurus](https://docusaurus.io/). Pages live in `docs/`.

## Local Development

```bash
pnpm install
pnpm run start   # dev server with live reload
```

## Build

```bash
pnpm run build   # static site in dist/
pnpm run serve   # preview dist/ locally
```

Broken links fail the build (`onBrokenLinks: 'throw'`).

The build reads two environment variables, which CI sets from repository variables:

- `VITE_HOST_URL`: the web app URL. It replaces `https://<your-gitgazer-domain>` in the pages and sets the "App" links; without it the placeholder stays and the links are left out.
- `DOCS_DOMAIN`: the docs host, used as the site URL for canonical links and the sitemap; without it the build uses `http://localhost:3000`.

## Deployment

The `upload` target in `package.json` syncs `dist/` to the docs S3 bucket and invalidates the docs CloudFront distribution:

```bash
DOCS_S3_BUCKET=<bucket> DOCS_DOMAIN=<docs-host> pnpm nx run @gitgazer/docs:upload
```

`upload` finds the distribution to invalidate by `DOCS_DOMAIN`. CI runs this for affected projects with `pnpm nx affected -t build upload`.
