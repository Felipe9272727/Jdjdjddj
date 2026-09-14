// Browser validation for Floor 12. This drives the real `?f12` route in
// touch emulation, including the DOM drag surface and the six-line encounter.
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
const fail = (message) => {
  throw new Error(message);
};
const assert = (condition, message) => {
  if (!condition) fail(message);
};

const readState = async (page) =>
  page.evaluate(() => {
    const s = window.__f12estado;
    if (!s) return null;
    return {
      fase: s.fase,
      nave: { ...s.nave },
      arma: s.arma ? { ...s.arma } : null,
      jogador: s.projeteis
        .filter((p) => p.tipo === "tiro" && p.de === "jogador")
        .map((p) => p.id),
      projeteis: s.projeteis.map((p) => ({ id: p.id, tipo: p.tipo, de: p.de })),
    };
  });

function touchPoint(id, x, y) {
  return { id, x, y, radiusX: 1, radiusY: 1, force: 1 };
}

async function dispatchTouch(client, type, points) {
  await client.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points,
    modifiers: 0,
  });
}

async function runTouchContract(page, orientation, viewport, diagnostics) {
  const client = await page.context().newCDPSession(page);
  const x = Math.round(viewport.width * 0.5);
  const y = Math.round(viewport.height * (orientation === "portrait" ? 0.58 : 0.64));
  const first = touchPoint(1, x, y);
  const second = touchPoint(2, Math.min(viewport.width - 32, x + 44), y + 28);

  let state = await readState(page);
  assert(state?.fase === "luta", `${orientation}: touch contract did not start in luta`);
  const initial = state;

  // Contact without movement banks stationary charge through the real overlay.
  await dispatchTouch(client, "touchStart", [first]);
  await page.waitForFunction(
    () => (window.__f12estado?.arma?.charge ?? 0) > 0.15,
    null,
    { timeout: 5_000 },
  );
  state = await readState(page);
  diagnostics.push({ step: "touch-stationary", state });
  assert(state?.arma?.active === true, `${orientation}: touchStart did not activate arma`);
  assert(
    state.arma.charge > (initial.arma?.charge ?? 0) + 0.15,
    `${orientation}: stationary touch did not grow charge`,
  );

  // A second finger must not steal the captured pointer. Keep the first point
  // in the CDP touch list while adding/removing the ignored second point.
  await dispatchTouch(client, "touchStart", [first, second]);
  const beforeSecondMove = await readState(page);
  const movedFirst = touchPoint(
    1,
    Math.max(24, Math.min(viewport.width - 24, x + (orientation === "portrait" ? 104 : 150))),
    Math.max(24, y - 76),
  );
  await dispatchTouch(client, "touchMove", [movedFirst, second]);
  await page.waitForFunction(
    ({ x0, y0, emitted0 }) => {
      const s = window.__f12estado;
      if (!s) return false;
      const moved = Math.hypot(s.nave.x - x0, s.nave.y - y0) > 0.06;
      const released = s.arma?.remaining > 0 || (s.arma?.emitted ?? emitted0) > emitted0;
      return moved && released;
    },
    { x0: beforeSecondMove.nave.x, y0: beforeSecondMove.nave.y, emitted0: beforeSecondMove.arma.emitted },
    { timeout: 5_000 },
  );
  state = await readState(page);
  diagnostics.push({ step: "touch-resume-with-second-finger", state });
  assert(
    Math.hypot(state.nave.x - beforeSecondMove.nave.x, state.nave.y - beforeSecondMove.nave.y) > 0.06,
    `${orientation}: touch drag did not move nave`,
  );
  assert(state.arma.active === true, `${orientation}: second touch stole active contact`);
  assert(state.arma.emitted > beforeSecondMove.arma.emitted || state.arma.remaining > 0,
    `${orientation}: resuming movement did not release charged volley`);

  // Keyboard input must not overwrite the active touch target.
  const targetBeforeKeyboard = state.nave.alvoX;
  await page.keyboard.down("ArrowLeft");
  await sleep(120);
  const duringKeyboard = await readState(page);
  await page.keyboard.up("ArrowLeft");
  diagnostics.push({ step: "keyboard-during-touch", state: duringKeyboard });
  assert(
    Math.abs(duringKeyboard.nave.alvoX - targetBeforeKeyboard) < 0.001,
    `${orientation}: keyboard overwrote active touch target`,
  );

  // End the ignored second contact first; the captured first contact must keep
  // firing until it is released. Then verify touchEnd silences immediately.
  await dispatchTouch(client, "touchEnd", [movedFirst]);
  await page.waitForFunction(
    () => window.__f12estado?.arma?.active === true,
    null,
    { timeout: 2_000 },
  );
  state = await readState(page);
  assert(state.arma.active === true, `${orientation}: ignored second touch ended first contact`);
  const emittedBeforeRelease = state.arma.emitted;
  await dispatchTouch(client, "touchEnd", []);
  await page.waitForFunction(
    () => window.__f12estado?.arma?.active === false,
    null,
    { timeout: 2_000 },
  );
  const afterRelease = await readState(page);
  diagnostics.push({ step: "touch-end", state: afterRelease });
  assert(afterRelease.arma.active === false, `${orientation}: touchEnd did not silence arma`);
  await sleep(180);
  const afterReleaseWait = await readState(page);
  assert(afterReleaseWait.arma.emitted === emittedBeforeRelease,
    `${orientation}: player projectiles spawned after touchEnd`);

  // Exercise touchCancel separately, including the phase-independent cleanup.
  const cancelPoint = touchPoint(3, x, y);
  await dispatchTouch(client, "touchStart", [cancelPoint]);
  await page.waitForFunction(
    () => window.__f12estado?.arma?.active === true,
    null,
    { timeout: 2_000 },
  );
  const beforeCancel = await readState(page);
  await dispatchTouch(client, "touchCancel", []);
  await page.waitForFunction(
    () => window.__f12estado?.arma?.active === false,
    null,
    { timeout: 2_000 },
  );
  const afterCancel = await readState(page);
  diagnostics.push({ step: "touch-cancel", state: afterCancel });
  assert(afterCancel.arma.active === false, `${orientation}: touchCancel did not silence arma`);
  await sleep(180);
  const afterCancelWait = await readState(page);
  assert(afterCancelWait.arma.emitted === beforeCancel.arma.emitted,
    `${orientation}: player projectiles spawned after touchCancel`);
}

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
    const diagnostics = [];
    try {
      context = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
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
      await entryButton.tap();
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

      await sleep(Math.max(0, 12_400 - (Date.now() - started)));
      await page.waitForFunction(() => window.__f12fase === "encontro", null, {
        timeout: 30_000,
      });
      diagnostics.push({
        step: "encounter-camera",
        state: await readState(page),
      });
      await page.screenshot({
        path: `${outputDir}/${orientation}-encounter-camera.png`,
      });

      // F12_ENCONTRO has six lines. Click the real dialogue button six times,
      // including the last click that transitions into the fight.
      for (let i = 0; i < 6; i += 1) {
        const dialogueButton = page.locator("button").last();
        await dialogueButton.waitFor({ state: "visible", timeout: 10_000 });
        await dialogueButton.tap();
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
      await runTouchContract(page, orientation, viewport, diagnostics);

      diagnostics.push({ step: "complete", state: await readState(page) });
      await saveJson(`${orientation}-diagnostic.json`, {
        orientation,
        viewport,
        hasTouch: true,
        isMobile: true,
        url: page.url(),
        diagnostics,
        events,
      });
      if (events.length)
        fail(`${orientation} browser errors: ${JSON.stringify(events)}`);
    } catch (error) {
      await page
        ?.screenshot({ path: `${outputDir}/${orientation}-failure.png` })
        .catch(() => {});
      await saveJson(`${orientation}-diagnostic.json`, {
        orientation,
        viewport,
        hasTouch: true,
        isMobile: true,
        error: String(error),
        url: page?.url() ?? baseUrl,
        state: await page?.evaluate(() => window.__f12estado ?? null).catch(() => null),
        bodyText:
          (
            await page
              ?.locator("body")
              .innerText()
              .catch(() => "")
          )?.slice(0, 4000) ?? "",
        diagnostics,
        events,
      });
      throw error;
    } finally {
      // Closing the context flushes recordVideo output to the artifact dir.
      await context?.close();
    }
  }
} finally {
  await browser?.close();
}

console.log(`Floor 12 touch screenshots, diagnostics, and videos written to ${outputDir}`);
