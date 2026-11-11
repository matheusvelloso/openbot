// Checks the messages between two agents in the chat. Drives the real `App` in the `App/Playground`
// story of a running Storybook. In the chat of Research, the "Message from Chief" line opens the
// exchange pane of the side panel, which lists Chief's request and Research's answer that waits in
// Chief's queue, oldest first; a second click closes the pane; "Open in Chief's chat" and the agent
// name on the line open Chief's own chat at that message, with no error.
//
// `bun scripts/agent-exchange-pane-e2e.ts --storybook=<url> [--browser-executable=<path>]`
// Writes .openbot-build/agent-exchange-pane-e2e/report.json and a screenshot of each state, and exits
// non-zero on a failure.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright-core";

const OUT = resolve(import.meta.dirname, "../.openbot-build/agent-exchange-pane-e2e");
const STORY = "app--playground";
const WAIT_MS = 15_000;
const REQUEST = "Please check the sources of the launch plan before I share it.";
/** The errors of a message that a chat cannot find or load (`chat.messageUnavailable`, `app.errorStatus.messageLoad`). */
const MESSAGE_ERROR = /no longer available|could not load messages/iu;
const ANSWER = "All four sources check out. The pricing link now points to the new page.";

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

async function selectAgent(page: Page, name: string): Promise<void> {
  await page.locator(".sidebar").getByText(name, { exact: true }).first().click();
  await page.locator(".conversation-header").getByText(name, { exact: true }).first().waitFor({ timeout: WAIT_MS });
}

/** The texts of the messages that the exchange pane lists, in order. */
async function paneTexts(page: Page): Promise<string[]> {
  return (await page.locator(".agent-exchange-message .agent-exchange-text").allInnerTexts()).map((text) =>
    text.trim(),
  );
}

/** The error banners of the chat, such as "This message is not available". */
async function chatErrors(page: Page): Promise<string[]> {
  return (await page.locator(".composer-error-banner, [role=alert]").allInnerTexts()).map((text) => text.trim());
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(
  browserExecutable ? { executablePath: browserExecutable } : { channel: "chrome" },
);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (error) => report.errors.push(error.stack ?? String(error)));
  await page.goto(`${storybook}/iframe.html?id=${STORY}&viewMode=story`, { timeout: 120_000 });
  await page.locator(".conversation-header").waitFor({ timeout: 60_000 });

  await selectAgent(page, "Research");
  const exchangeButton = page.getByRole("button", { name: "Show all messages with Chief" });
  await exchangeButton.first().waitFor({ timeout: WAIT_MS });
  check("marker: the line of Chief's request has the exchange button", (await exchangeButton.count()) > 0);

  await exchangeButton.first().click();
  await page.locator(".agent-exchange-panel").waitFor({ timeout: WAIT_MS });
  await page
    .locator(".agent-exchange-message")
    .nth(1)
    .waitFor({ timeout: WAIT_MS })
    .catch(() => undefined);
  const texts = await paneTexts(page);
  const selectedTab = await page.getByRole("tab", { name: "Agent messages" }).getAttribute("aria-selected");
  check(
    "pane: opens as the selected Agent messages tab and lists the request and the queued answer, oldest first",
    selectedTab === "true" && texts.length === 2 && texts[0] === REQUEST && texts[1] === ANSWER,
    { selectedTab, texts },
  );
  const status = (
    await page.locator(".agent-exchange-message").nth(1).locator(".agent-exchange-status").allInnerTexts()
  )
    .map((text) => text.trim())
    .join(" ");
  check("pane: the answer that waits in Chief's queue names its state", status.length > 0, status);
  await shot(page, "exchange-pane");

  await exchangeButton.first().click();
  const closed = await page
    .locator(".agent-exchange-panel")
    .waitFor({ state: "detached", timeout: WAIT_MS })
    .then(() => true)
    .catch(() => false);
  check("pane: a second click on the button closes the pane", closed);

  await exchangeButton.first().click();
  await page.locator(".agent-exchange-message").first().waitFor({ timeout: WAIT_MS });
  await page.locator(".agent-exchange-message").first().getByRole("button", { name: "Open in Chief's chat" }).click();
  await page.locator(".conversation-header").getByText("Chief", { exact: true }).first().waitFor({ timeout: WAIT_MS });
  await page
    .getByText(REQUEST)
    .first()
    .waitFor({ timeout: WAIT_MS })
    .catch(() => undefined);
  const fromPane = await chatErrors(page);
  check(
    "pane link: opens Chief's own chat at the request, with no error",
    !fromPane.some((text) => MESSAGE_ERROR.test(text)),
    fromPane,
  );
  await shot(page, "chief-chat-from-pane");

  await selectAgent(page, "Research");
  await page.locator(".chat-action-marker").getByRole("button", { name: "Open chat with Chief" }).first().click();
  await page.locator(".conversation-header").getByText("Chief", { exact: true }).first().waitFor({ timeout: WAIT_MS });
  const fromMarker = await chatErrors(page);
  check(
    "marker link: the agent name opens Chief's own chat at the message, with no error",
    !fromMarker.some((text) => MESSAGE_ERROR.test(text)),
    fromMarker,
  );
  await shot(page, "chief-chat-from-marker");

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
