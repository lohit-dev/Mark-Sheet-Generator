# CNR Marks Sheet Generator

A browser-based marks sheet creator with a floral notebook-style preview. It runs as a static site; Bun provides local development, builds, and browser checks.

## Requirements

- Bun 1.4.4 or newer
- Google Chrome for the responsive browser check
- Internet access for Google Fonts, Excel import, and PNG export libraries

## Project structure

```text
src/                    App source served by the development server
  index.html
  app.js
  assets.js
  styles.css
  fonts.css
  assets/svg/            Sheet artwork
scripts/                Bun development, build, and browser-check scripts
dist/                   Generated static site (ignored by Git)
.github/workflows/       GitHub Pages deployment
```

## Run locally

```sh
bun install
bun run dev
```

Open <http://127.0.0.1:5173>. Stop the server with `Ctrl+C`.

## Check responsive layout and fonts

```sh
bun run check:responsive
```

The check opens Chrome at desktop, tablet, and phone sizes, checks the loaded sheet fonts and layout, then saves screenshots to `responsive-check-output/`. It exits with a non-zero status if a check fails. To install Chrome if needed:

```sh
bunx playwright install chrome
```

## Build and preview the deployable site

```sh
bun run build
bun run preview
```

The build copies the static app into `dist/`. The preview server runs at <http://127.0.0.1:5173> and serves that generated folder.

## Deploy to GitHub Pages

This repository includes a GitHub Actions workflow that builds with Bun and deploys `dist/` whenever `main` receives a push.

1. In the GitHub repository, open **Settings → Pages** and set the source to **GitHub Actions**.
2. Commit and push to `main`:

```sh
git add .
git commit -m "Set up Bun build and GitHub Pages deployment"
git push origin main
```

3. Check **Actions** in GitHub until **Build and deploy to GitHub Pages** succeeds. The workflow summary includes the live site URL.

## Marks input

- **Internal + External:** each student's total is calculated as external + internal.
- **Total marks only:** enter one mark value per student.
- Enter `Ab` in a marks field to mark a student absent. In split mode, Ab in either field marks the student absent.
- Absent students are excluded from the grand total and average.
- Average is `grand total ÷ (present students × maximum marks) × 100`.

CSV import is built in. Excel `.xlsx` and `.xls` import uses SheetJS from a CDN. PNG export uses html2canvas from a CDN. Fonts load from Google Fonts; offline system fallbacks are used when the network is unavailable. All student data stays in the browser's local storage.
