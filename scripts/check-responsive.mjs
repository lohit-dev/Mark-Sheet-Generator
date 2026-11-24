#!/usr/bin/env node

// Browser check for the responsive preview and the sheet fonts.
// Run from the project folder after `bun install`:
//   bun run check:responsive

import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const siteRoot = resolve(projectRoot, "dist");
const output = resolve(projectRoot, "output");
let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright is not installed. Run: bun install");
  process.exit(1);
}

await import("./build.mjs");
await mkdir(output, { recursive: true });

let browser;
let failed = false;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  page.on("pageerror", (error) => {
    failed = true;
    console.error(`Page error: ${error.message}`);
  });
  await page.goto(pathToFileURL(resolve(siteRoot, "index.html")).href, {
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
  await page.locator("#branch").fill("North Valley Regional Campus Branch");
  await page.locator("#teacher").fill("D.V.N.S. Rama Rao, Senior Mathematics Teacher");
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
          document.fonts.load('400 38px "Patrick Hand"'),
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
        fittedTextSizes: {
          title: document.querySelector("#sheetTitle").style.fontSize,
          subtitle: document.querySelector("#sheetSubtitle").style.fontSize,
          average: document.querySelector(".label.avg span").style.fontSize,
          total: document.querySelector(".label.tot span").style.fontSize,
          teacher: document.querySelector("#teacherLine").style.fontSize,
        },
        textOverflow: [
          "#sheetTitle",
          "#sheetSubtitle",
          ".label.avg span",
          ".label.tot span",
          "#teacherLine",
        ].some((selector) => {
          const element = document.querySelector(selector);
          return element.scrollWidth > element.clientWidth + 1;
        }),
        patrickHandLoaded: document.fonts.check('400 38px "Patrick Hand"'),
        overflowElements: [...document.querySelectorAll("body *")]
          .map((element) => ({
            name: element.id || element.className || element.tagName,
            right: Math.round(element.getBoundingClientRect().right),
            width: Math.round(element.getBoundingClientRect().width),
            insideScrollArea: Boolean(element.closest(".entry-wrap")),
          }))
          .filter((element) => element.right > innerWidth + 1 && !element.insideScrollArea)
          .slice(0, 8),
      };
    });
    const columnCount = result.gridColumns.trim().split(/\s+/).length;
    const layoutOkay = viewport.stacked
      ? columnCount === 1 && result.secondPageTop > result.firstPageTop
      : columnCount === 2;
    const widthOkay = result.documentWidth <= viewport.width;
    const fontOkay =
      result.patrickHandLoaded &&
      result.titleWeight === "700" &&
      result.tableWeight === "700" &&
      result.titleFont.includes("Patrick Hand") &&
      result.tableFont.includes("Patrick Hand") &&
      !result.textOverflow;
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
}

console.log(`Screenshots are in ${output}`);
process.exitCode = failed ? 1 : 0;
