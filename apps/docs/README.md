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

## Deployment

The `upload` target in `package.json` syncs `dist/` to the docs S3 bucket and invalidates the docs CloudFront distribution:

```bash
DOCS_S3_BUCKET=<bucket> pnpm nx run @gitgazer/docs:upload
```

`DOCS_DOMAIN` (default `docs.gitgazer.com`) selects the distribution to invalidate. CI runs this for affected projects with `pnpm nx affected -t build upload`.
