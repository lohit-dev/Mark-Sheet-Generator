#!/usr/bin/env node

// Browser check for the phone-first layout and the look of the sheet.
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

let failed = false;

function report(ok, label, detail) {
  if (!ok) failed = true;
  const extra = detail === undefined ? "" : " " + JSON.stringify(detail);
  console.log((ok ? "PASS " : "FAIL ") + label + extra);
}

function sampleCsv(count) {
  const rows = ["Name,External,Internal"];
  for (let index = 1; index <= count; index++) {
    const longer = index % 7 === 0 ? " with a longer sample name" : " Name";
    const name = "Student " + String(index).padStart(2, "0") + longer;
    rows.push(name + "," + (55 + (index % 25)) + ",20");
  }
  rows.push("Absent Student,Ab,Ab");
  return rows.join("\n");
}

async function measure(page) {
  return page.evaluate(async () => {
    await Promise.race([
      document.fonts.ready,
      new Promise((done) => setTimeout(done, 12000)),
    ]);
    const sheet = document.querySelector("#marksSheet");
    const ribbon = sheet.querySelector(".page.left .ribbon").getBoundingClientRect();
    const title = sheet.querySelector('[data-f="title"]');
    const titleBox = title.getBoundingClientRect();
    const allText = [...sheet.querySelectorAll("*")].filter(
      (element) => element.children.length === 0 && element.textContent.trim() !== "",
    );
    const weights = new Set(allText.map((element) => getComputedStyle(element).fontWeight));
    const rowsA = sheet.querySelectorAll('[data-f="tblA"] tbody tr').length;
    const rowsB = sheet.querySelectorAll('[data-f="tblB"] tbody tr').length;
    const overflowing = [...document.querySelectorAll("body *")]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.right > innerWidth + 1 && !element.closest("#stage");
      })
      .map((element) => element.id || element.className || element.tagName)
      .slice(0, 6);
    return {
      documentWidth: document.documentElement.scrollWidth,
      weights: [...weights],
      titleInsideRibbon:
        titleBox.left >= ribbon.left - 1 &&
        titleBox.right <= ribbon.right + 1 &&
        titleBox.top >= ribbon.top - 1 &&
        titleBox.bottom <= ribbon.bottom + 1,
      titleFits: title.scrollWidth <= title.clientWidth + 1,
      rowsA,
      rowsB,
      patrick: document.fonts.check('400 20px "Patrick Hand"'),
      kalam: document.fonts.check('400 20px "Kalam"'),
      overflowing,
    };
  });
}

let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    failed = true;
    console.error("Page error: " + error.message);
  });

  await page.goto(pathToFileURL(resolve(siteRoot, "index.html")).href, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("#marksSheet", { state: "attached" });
  await page.waitForFunction(() => window.__sheet !== undefined);

  await page.locator("#className").selectOption("IX");
  await page.locator("#exam").selectOption("SA-1");
  await page.locator("#subject").fill("MATHS");
  await page.evaluate(() => window.__sheet.setTab("marks"));
  await page.locator("#moreTools").evaluate((element) => (element.open = true));
  await page.locator("#csvPaste").fill(sampleCsv(30));
  await page.locator("#importPaste").click();
  await page.waitForFunction(() => window.__sheet.students.length === 31);

  const stats = await page.evaluate(() => ({
    count: window.__sheet.students.length,
    average: document.querySelector("#sumAverage").textContent,
    absent: document.querySelector("#sumAbsent").textContent,
  }));
  report(stats.count === 31 && stats.absent === "1", "import keeps absent students", stats);

  await page.locator('[data-sort="high"]').click();
  const sorted = await page.evaluate(() => {
    const totals = window.__sheet.students
      .filter((s) => s.external !== "Ab")
      .map((s) => Number(s.external) + Number(s.internal));
    const lastIsAbsent = window.__sheet.students.at(-1).external === "Ab";
    const descending = totals.every((value, i) => i === 0 || totals[i - 1] >= value);
    return { descending, lastIsAbsent };
  });
  report(sorted.descending && sorted.lastIsAbsent, "sort highest first, absent last", sorted);
  await page.locator("#undoSort").click();

  await page.evaluate(() => window.__sheet.setTab("sheet"));
  await page.waitForTimeout(200);

  const sizes = [
    { name: "phone", width: 360, height: 800 },
    { name: "small-phone", width: 320, height: 640 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1440, height: 900 },
  ];
  for (const size of sizes) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.waitForTimeout(250);
    const result = await measure(page);
    const ok =
      result.documentWidth <= size.width &&
      result.overflowing.length === 0 &&
      result.weights.length === 1 &&
      result.weights[0] === "400" &&
      result.titleInsideRibbon &&
      result.titleFits &&
      result.rowsA === 16 &&
      result.rowsB === 16 &&
      result.patrick &&
      result.kalam;
    report(ok, size.name + " " + size.width + "x" + size.height, result);
    await page.screenshot({
      path: resolve(output, "preview-" + size.name + ".png"),
      fullPage: true,
    });
  }

  await page.setViewportSize({ width: 360, height: 800 });
  await page.locator('[data-tab-btn="details"]').click();
  await page.locator('[data-mode="total"]').click();
  await page.locator("#className").selectOption("X");
  await page.locator("#exam").selectOption("MIDTERM");
  await page.evaluate(() => window.__sheet.setTab("sheet"));
  await page.waitForTimeout(250);
  const totalOnly = await measure(page);
  report(
    totalOnly.titleInsideRibbon && totalOnly.titleFits && totalOnly.weights[0] === "400",
    "total-only title sits inside the ribbon",
    totalOnly,
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  const printResult = await page.evaluate(() => {
    const sheet = document.querySelector("#marksSheet");
    return {
      columns: getComputedStyle(sheet).gridTemplateColumns.trim().split(" ").length,
    };
  });
  report(printResult.columns === 2, "print always uses the two-page spread", printResult);
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  if (browser) await browser.close();
}

console.log("Screenshots are in " + output);
process.exitCode = failed ? 1 : 0;
