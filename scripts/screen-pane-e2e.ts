// Checks the Screen pane of a chat. Drives the real `App` in the `Conversation/Screen pane` story of a
// running Storybook, where the preview mock plays Chief's Computer Use work as main reports it: the
// pane opens by itself when the turn uses an app; it shows Live, what Chief does, the window picture,
// Stop and the steps, which grow; between two turns it shows Idle and no Stop; a pane that the user
// closed stays closed for the rest of the turn and opens again with the next turn.
//
// `bun scripts/screen-pane-e2e.ts --storybook=<url> [--browser-executable=<path>]`
// Writes .openbot-build/screen-pane-e2e/report.json and a screenshot of each state, and exits non-zero
// on a failure.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright-core";

const OUT = resolve(import.meta.dirname, "../.openbot-build/screen-pane-e2e");
const STORY = "conversation-screen-pane--working";
const WAIT_MS = 20_000;

function option(name: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}
const storybook = option("storybook")?.replace(/\/$/, "");
const browserExecutable = option("browser-executable");
assert.ok(storybook, "Pass --storybook=<url> from `bun run storybook`.");

const checks: { name: string; passed: boolean; detail?: unknown }[] = [];
function check(name: string, passed: boolean, detail?: unknown) {
  checks.push({ name, passed, ...(detail === undefined ? {} : { detail }) });
}
const report: { passed: boolean; checks: typeof checks; errors: string[]; error?: string } = {
  passed: false,
  checks,
  errors: [],
};

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}

const pane = (page: Page) => page.locator("aside.screen-pane");

/** Waits until the badge says `text`, and returns whether it did. */
async function badgeBecomes(page: Page, text: string): Promise<boolean> {
  return page
    .waitForFunction(
      (want) => document.querySelector("aside.screen-pane .screen-pane-badge")?.textContent?.trim() === want,
      text,
      { timeout: WAIT_MS },
    )
    .then(() => true)
    .catch(() => false);
}

async function stepCount(page: Page): Promise<number> {
  return pane(page).locator(".screen-pane-step").count();
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(
  browserExecutable ? { executablePath: browserExecutable } : { channel: "chrome" },
);
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => report.errors.push(error.stack ?? String(error)));
  await page.goto(`${storybook}/iframe.html?id=${STORY}&viewMode=story`, { timeout: 120_000 });
  await page.locator(".conversation-header").waitFor({ timeout: 60_000 });

  const opened = await pane(page)
    .waitFor({ timeout: WAIT_MS })
    .then(() => true)
    .catch(() => false);
  const selected = await page.getByRole("tab", { name: "Screen" }).getAttribute("aria-selected");
  check("open: the Screen pane opens by itself when Chief's turn uses an app", opened && selected === "true", {
    opened,
    selected,
  });

  const live = await badgeBecomes(page, "Live");
  await page
    .getByRole("img", { name: /dashboard\.tsx/u })
    .waitFor({ timeout: WAIT_MS })
    .catch(() => undefined);
  const now = (await pane(page).locator(".screen-pane-now").innerText()).trim();
  const picture = await page.getByRole("img", { name: /dashboard\.tsx/u }).count();
  const stop = await page.getByRole("button", { name: "Stop Chief" }).count();
  check(
    "live: the pane shows Live, what Chief does, the window picture and Stop",
    live && now.startsWith("Chief is") && picture === 1 && stop === 1,
    {
      live,
      now,
      picture,
      stop,
    },
  );
  await shot(page, "live");

  // Measured inside one turn: from its first steps, because a new turn starts its list again.
  await page
    .waitForFunction(
      () => {
        const count = document.querySelectorAll("aside.screen-pane .screen-pane-step").length;
        return count > 0 && count <= 2;
      },
      undefined,
      { timeout: WAIT_MS },
    )
    .catch(() => undefined);
  const before = await stepCount(page);
  await page
    .waitForFunction(
      (count) => document.querySelectorAll("aside.screen-pane .screen-pane-step").length > count,
      before,
      { timeout: WAIT_MS },
    )
    .catch(() => undefined);
  const after = await stepCount(page);
  check("steps: the steps of the turn grow while Chief works", after > before, { before, after });

  const idle = await badgeBecomes(page, "Idle");
  const idleStop = await page.getByRole("button", { name: "Stop Chief" }).count();
  const idlePicture = await page.getByRole("img", { name: /dashboard\.tsx/u }).count();
  const idleNow = (await pane(page).locator(".screen-pane-now").innerText()).trim();
  check(
    "idle: between turns the pane shows Idle, the last picture and no Stop",
    idle && idleStop === 0 && idlePicture === 1,
    {
      idle,
      idleStop,
      idlePicture,
      idleNow,
    },
  );
  await shot(page, "idle");

  // A new turn: close the pane at once, and it stays closed for the rest of this turn.
  await badgeBecomes(page, "Live");
  await page.locator('.side-panel-tab-close[title="Close Screen"]').click();
  const closed = await pane(page)
    .waitFor({ state: "detached", timeout: WAIT_MS })
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(3_000);
  const stayedClosed = (await pane(page).count()) === 0;
  check("close: a pane that the user closed stays closed for the rest of the turn", closed && stayedClosed, {
    closed,
    stayedClosed,
  });

  const reopened = await pane(page)
    .waitFor({ timeout: WAIT_MS })
    .then(() => true)
    .catch(() => false);
  check("reopen: the next turn that uses an app opens the pane again", reopened);
  await shot(page, "reopened");

  await badgeBecomes(page, "Live");
  await page
    .getByRole("button", { name: "Stop Chief" })
    .click({ timeout: WAIT_MS })
    .catch(() => undefined);
  check("page: no uncaught error", report.errors.length === 0, report.errors);
  report.passed = checks.every((entry) => entry.passed);
} catch (error) {
  report.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
} finally {
  await browser.close();
  writeFileSync(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
}
for (const entry of checks) process.stdout.write(`${entry.passed ? "PASS" : "FAIL"} ${entry.name}\n`);
if (report.error) process.stdout.write(`${report.error}\n`);
process.stdout.write(`Report: ${join(OUT, "report.json")}\n`);
if (!report.passed) process.exitCode = 1;
