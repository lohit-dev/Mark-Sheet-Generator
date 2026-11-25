# CNR Marks Sheet Generator

A browser-based marks sheet creator with a floral notebook-style preview. It runs as a static site; Bun provides local development, builds, browser checks, and GitHub Pages deployment.

## Requirements

- Bun 1.4.4 or newer
- Google Chrome for the responsive browser check
- No internet needed to run the app: fonts, Excel import (SheetJS) and PNG export (html2canvas) are bundled

## Project structure

```text
public/                 Static HTML and sheet artwork
  index.html
  assets/svg/           Ribbon, label and flower artwork
  assets/fonts/         Patrick Hand, Kalam, Pangolin digits, Inter (woff2)
  assets/vendor/        SheetJS and html2canvas
src/css/                App styles and self-hosted font setup
src/js/                 App logic and asset registry
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

The check builds the deployable site, opens Chrome at phone, small-phone, tablet and desktop sizes, checks that sheet text is regular weight (not faux-bold), the ribbon title stays inside the ribbon, each page has 16 rows, nothing scrolls sideways, and print uses the two-page spread, then saves screenshots to `output/`. It exits with a non-zero status if a check fails. To install Chrome if needed:

```sh
bunx playwright install chrome
```

## Build and preview the deployable site

```sh
bun run build
bun run preview
```

The build copies the static app into `dist/`. The preview server runs at <http://127.0.0.1:5173> and serves that generated folder. Run `PORT=5174 bun run preview` if port 5173 is occupied.

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

## Phone use

The app is built phone-first. Three tabs at the bottom: **Details**, **Marks**, **Sheet**. Marks are typed on large student cards (tap **Ab** for absent). The sheet preview shows one page at a time on a phone; **Save picture** / **Share picture** always produce the full two-page spread, and Print uses A4 landscape.

CSV import is built in, and Excel `.xlsx` / `.xls` import works offline. Everything stays in the browser's local storage and is saved when the page is hidden or closed.
