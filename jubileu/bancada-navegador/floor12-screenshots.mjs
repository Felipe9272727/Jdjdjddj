// Temporary browser validation for Floor 12. The Vite dev server is started by
// CI; this script only drives the real page and writes PNGs.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import process from "node:process";

const baseUrl = process.env.F12_URL ?? "http://127.0.0.1:4173/floor12-dev.html";
const outputDir = process.env.F12_SCREENSHOT_DIR ?? "artifacts/floor12-browser";
const introMilestones = [
  ["intro-doors", 1_700],
  ["intro-transform", 4_700],
  ["intro-reveal", 9_000],
];
const viewports = [
  ["portrait", { width: 412, height: 915 }],
  ["landscape", { width: 915, height: 412 }],
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
  ],
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  for (const [orientation, viewport] of viewports) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });

    await page.goto(baseUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.getByRole("button", { name: /ANDAR 12/i }).click();
    const started = Date.now();

    for (const [name, atMs] of introMilestones) {
      await sleep(Math.max(0, atMs - (Date.now() - started)));
      await page.screenshot({
        path: `${outputDir}/${orientation}-${name}.png`,
      });
    }

    // The intro ends at 12 seconds and presents six dialogue lines before
    // the fight. Clicking the visible button advances each line.
    await sleep(Math.max(0, 12_400 - (Date.now() - started)));
    await page.waitForFunction(() => window.__f12fase === "encontro", null, {
      timeout: 60_000,
    });
    for (let i = 0; i < 6; i += 1) {
      await page.locator("button").last().click();
      await sleep(120);
    }
    await page.waitForFunction(() => window.__f12fase === "luta", null, {
      timeout: 60_000,
    });
    await page.waitForSelector("text=ATIRE NA BOCA!", { timeout: 30_000 });
    await page.screenshot({
      path: `${outputDir}/${orientation}-combat-open-mouth.png`,
    });

    if (pageErrors.length) {
      throw new Error(
        `${orientation} browser errors:\n${pageErrors.join("\n")}`,
      );
    }
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`Floor 12 screenshots written to ${outputDir}`);
