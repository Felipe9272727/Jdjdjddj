// Temporary browser validation for Floor 12. The Vite dev server is started by
// CI; this script drives the real `?f12` route and writes PNGs plus videos.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";

const baseUrl = process.env.F12_URL ?? "http://127.0.0.1:4173/index.html?f12";
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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const saveJson = async (name, value) => {
  await writeFile(
    `${outputDir}/${name}`,
    `${JSON.stringify(value, null, 2)}\n`,
  );
};

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
    ],
  });
} catch (error) {
  await saveJson("browser-launch-errors.json", {
    error: String(error),
    url: baseUrl,
  });
  throw error;
}

try {
  for (const [orientation, viewport] of viewports) {
    let context;
    let page;
    const events = [];
    try {
      context = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
        recordVideo: { dir: outputDir, size: viewport },
      });
      page = await context.newPage();
      page.on("pageerror", (error) =>
        events.push({ type: "pageerror", text: String(error) }),
      );
      page.on("console", (message) => {
        if (message.type() === "error")
          events.push({ type: "console.error", text: message.text() });
      });
      page.on("requestfailed", (request) =>
        events.push({
          type: "requestfailed",
          url: request.url(),
          text: request.failure()?.errorText ?? "unknown request failure",
        }),
      );

      await page.goto(baseUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      // `main.tsx` selects Floor12Dev when `?f12` is present. Wait for
      // its actual entry button, rather than assuming the lazy import is
      // ready immediately after DOMContentLoaded.
      await page.waitForFunction(
        () =>
          document.readyState === "complete" &&
          !!document.querySelector("#root"),
        null,
        { timeout: 30_000 },
      );
      const entryButton = page
        .locator("button")
        .filter({ hasText: "ANDAR 12" })
        .first();
      await entryButton.waitFor({ state: "visible", timeout: 60_000 });
      await entryButton.click();
      await page.waitForFunction(
        () => typeof window.__f12fase === "string",
        null,
        { timeout: 30_000 },
      );
      const started = Date.now();

      for (const [name, atMs] of introMilestones) {
        await sleep(Math.max(0, atMs - (Date.now() - started)));
        await page.screenshot({
          path: `${outputDir}/${orientation}-${name}.png`,
        });
      }

      // The intro ends at 12 seconds and presents six dialogue lines.
      await sleep(Math.max(0, 12_400 - (Date.now() - started)));
      await page.waitForFunction(() => window.__f12fase === "encontro", null, {
        timeout: 30_000,
      });
      for (let i = 0; i < 6; i += 1) {
        const dialogueButton = page.locator("button").last();
        await dialogueButton.waitFor({ state: "visible", timeout: 10_000 });
        await dialogueButton.click();
        await sleep(120);
      }
      await page.waitForFunction(() => window.__f12fase === "luta", null, {
        timeout: 30_000,
      });
      await page
        .getByText("ATIRE NA BOCA!", { exact: true })
        .waitFor({ state: "visible", timeout: 30_000 });
      await page.screenshot({
        path: `${outputDir}/${orientation}-combat-open-mouth.png`,
      });

      if (events.length)
        throw new Error(
          `${orientation} browser errors: ${JSON.stringify(events)}`,
        );
    } catch (error) {
      await page
        ?.screenshot({ path: `${outputDir}/${orientation}-failure.png` })
        .catch(() => {});
      await saveJson(`${orientation}-errors.json`, {
        error: String(error),
        url: page?.url() ?? baseUrl,
        bodyText:
          (
            await page
              ?.locator("body")
              .innerText()
              .catch(() => "")
          )?.slice(0, 4000) ?? "",
        events,
      });
      throw error;
    } finally {
      // Closing the context flushes recordVideo output to the artifact dir.
      await context?.close();
    }
  }
} finally {
  await browser.close();
}

console.log(`Floor 12 screenshots and videos written to ${outputDir}`);
