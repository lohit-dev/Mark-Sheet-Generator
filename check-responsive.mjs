#!/usr/bin/env node

// Browser check for the responsive preview and the sheet fonts.
// Run from the project folder after installing Playwright:
//   npm install --no-save playwright
//   node check-responsive.mjs

import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const output = resolve(root, "responsive-check-output");
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright is not installed. Run: npm install --no-save playwright");
  process.exit(1);
}

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const contents = await readFile(file || resolve(root, "index.html"));
    response.writeHead(200, {
      "content-type": mime[extname(file)] || "application/octet-stream",
    });
    response.end(contents);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

await mkdir(output, { recursive: true });
await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));

let browser;
let failed = false;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  page.on("pageerror", (error) => {
    failed = true;
    console.error(`Page error: ${error.message}`);
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("#marksSheet");
  await page.waitForFunction(() => window.__cnr !== undefined);
  const sampleRows = ["Name,External,Internal"];
  for (let index = 1; index <= 31; index++) {
    const name = `Student ${String(index).padStart(2, "0")}${index % 7 === 0 ? " with a longer sample name" : " Name"}`;
    sampleRows.push(`${name},${55 + (index % 45)},20`);
  }
  await page.locator(".paste").evaluate((element) => (element.open = true));
  await page.locator("#csvPaste").fill(sampleRows.join("\n"));
  await page.locator("#importPaste").click();
  await page.waitForFunction(() => window.__cnr.students.length === 31);
  await page.evaluate(async () => {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 12000)),
    ]);
  });

  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000, stacked: false },
    { name: "tablet", width: 768, height: 1024, stacked: false },
    { name: "mobile", width: 390, height: 844, stacked: true },
    { name: "small-mobile", width: 320, height: 740, stacked: true },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(150);
    const result = await page.evaluate(async () => {
      await Promise.race([
        Promise.all([
          document.fonts.load('700 38px "Kalam"'),
          document.fonts.load('700 44px "Dancing Script"'),
        ]),
        new Promise((resolve) => setTimeout(resolve, 12000)),
      ]);
      const sheet = document.querySelector("#marksSheet");
      const pages = [...sheet.querySelectorAll(".page")];
      const bounds = pages.map((element) => element.getBoundingClientRect());
      return {
        viewport: `${innerWidth}x${innerHeight}`,
        documentWidth: document.documentElement.scrollWidth,
        stageWidth: Math.round(document.querySelector("#stage").clientWidth),
        stageHeight: Math.round(document.querySelector("#stage").clientHeight),
        gridColumns: getComputedStyle(sheet).gridTemplateColumns,
        firstPageTop: Math.round(bounds[0].top),
        secondPageTop: Math.round(bounds[1].top),
        titleFont: getComputedStyle(document.querySelector("#sheetTitle")).fontFamily,
        tableFont: getComputedStyle(document.querySelector("#tblA td")).fontFamily,
        titleWeight: getComputedStyle(document.querySelector("#sheetTitle")).fontWeight,
        tableWeight: getComputedStyle(document.querySelector("#tblA th")).fontWeight,
        kalamLoaded: document.fonts.check('700 38px "Kalam"'),
        dancingScriptLoaded: document.fonts.check('700 44px "Dancing Script"'),
      };
    });
    const columnCount = result.gridColumns.trim().split(/\s+/).length;
    const layoutOkay = viewport.stacked
      ? columnCount === 1 && result.secondPageTop > result.firstPageTop
      : columnCount === 2;
    const widthOkay = result.documentWidth <= viewport.width;
    const fontOkay =
      result.kalamLoaded &&
      result.dancingScriptLoaded &&
      result.titleWeight === "700" &&
      result.tableWeight === "700" &&
      result.titleFont.includes("Kalam") &&
      result.tableFont.includes("Kalam");
    if (!layoutOkay || !widthOkay || !fontOkay) failed = true;

    const screenshot = `preview-${viewport.name}.png`;
    await page.screenshot({ path: resolve(output, screenshot), fullPage: true });
    console.log(
      `${layoutOkay && widthOkay && fontOkay ? "PASS" : "FAIL"} ${viewport.name}: ` +
        JSON.stringify(result) +
        ` | screenshot: ${screenshot}`,
    );
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ media: "print" });
  const printResult = await page.evaluate(() => {
    const sheet = document.querySelector("#marksSheet");
    const pages = [...sheet.querySelectorAll(".page")];
    const pageHeight = Math.max(...pages.map((element) => element.offsetHeight));
    const configuredHeight = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--sheet-h"),
    );
    return {
      columns: getComputedStyle(sheet).gridTemplateColumns.trim().split(/\s+/).length,
      pageHeight,
      configuredHeight,
    };
  });
  const printOkay =
    printResult.columns === 2 &&
    Math.abs(printResult.pageHeight - printResult.configuredHeight) <= 1;
  if (!printOkay) failed = true;
  console.log(`${printOkay ? "PASS" : "FAIL"} phone print layout: ${JSON.stringify(printResult)}`);
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  if (browser) await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}

console.log(`Screenshots are in ${output}`);
process.exitCode = failed ? 1 : 0;
