const readline = require("node:readline");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let browser;
let context;
let page;
let server;
let origin;
const consoleErrors = [];
const pageErrors = [];

const reply = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

const localhost = (url) => {
  const parsed = new URL(url);
  return (
    parsed.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)
  );
};

const ensureOrigin = (url) => {
  const parsed = new URL(url, origin);
  if (!localhost(parsed) || parsed.origin !== origin) {
    throw new Error(`Navigation outside ${origin} is blocked`);
  }
  return parsed.toString();
};

const waitForHealth = async (url, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Application health check timed out: ${url}`);
};

const initialize = async ({ appServer }) => {
  if (!localhost(appServer.browserBaseUrl) || !localhost(appServer.healthUrl)) {
    throw new Error("Browser controller requires localhost URLs");
  }
  origin = new URL(appServer.browserBaseUrl).origin;
  if (new URL(appServer.healthUrl).origin !== origin) {
    throw new Error("Browser and health URLs must use the same origin");
  }
  server = spawn(appServer.command, appServer.args, {
    cwd: "/workspace",
    env: { ...process.env, ...(appServer.env || {}) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => process.stderr.write(chunk));
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));
  await waitForHealth(appServer.healthUrl, appServer.healthTimeoutMs);
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext();
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["http:", "https:"].includes(url.protocol) && url.origin !== origin) {
      pageErrors.push(`Blocked external request: ${url.href}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    try {
      ensureOrigin(frame.url());
    } catch (error) {
      pageErrors.push(error instanceof Error ? error.message : String(error));
    }
  });
  await page.goto(appServer.browserBaseUrl);
  return { text: `Browser ready at ${page.url()}` };
};

const locator = (value) => {
  if (!value) return page;
  if (value.kind === "role") {
    return page.getByRole(value.value, value.name ? { name: value.name } : undefined);
  }
  if (value.kind === "label") return page.getByLabel(value.value);
  if (value.kind === "text") return page.getByText(value.value);
  if (value.kind === "testId") return page.getByTestId(value.value);
  throw new Error(`Unsupported locator kind: ${value.kind}`);
};

const inspect = async () => {
  const snapshot = await page.locator("body").ariaSnapshot({ timeout: 5000 });
  return {
    text: [
      `URL: ${page.url()}`,
      snapshot,
      `console.error: ${JSON.stringify(consoleErrors.slice(-20))}`,
      `page errors: ${JSON.stringify(pageErrors.slice(-20))}`,
    ].join("\n"),
  };
};

const runTool = async (tool, args) => {
  if (!page) throw new Error("Browser is not initialized");
  if (tool === "browser_open") {
    await page.goto(ensureOrigin(args.path));
    return inspect();
  }
  if (tool === "browser_inspect") return inspect();
  if (tool === "browser_click") {
    await locator(args.locator).click();
    return inspect();
  }
  if (tool === "browser_fill") {
    await locator(args.locator).fill(args.value);
    return inspect();
  }
  if (tool === "browser_press") {
    await locator(args.locator).press(args.key);
    return inspect();
  }
  if (tool === "browser_wait") {
    if (args.text) {
      await page.getByText(args.text).waitFor({ timeout: args.timeoutMs || 5000 });
    } else {
      await page.waitForTimeout(args.timeoutMs || 500);
    }
    return inspect();
  }
  if (tool === "browser_screenshot") {
    const image = await page.screenshot({ fullPage: args.fullPage !== false });
    return { text: `Screenshot captured at ${page.url()}`, imageBase64: image.toString("base64") };
  }
  if (tool === "browser_errors") {
    return {
      text: JSON.stringify({ consoleErrors, pageErrors }, null, 2),
    };
  }
  throw new Error(`Unsupported browser tool: ${tool}`);
};

input.on("line", async (line) => {
  try {
    const request = JSON.parse(line);
    if (request.type === "initialize") {
      reply({ success: true, ...(await initialize(request)) });
      return;
    }
    if (request.type === "tool") {
      reply({ success: true, ...(await runTool(request.tool, request.arguments || {})) });
      return;
    }
    if (request.type === "close") {
      await context?.tracing.stop({ path: "/artifacts/agent-browser-trace.zip" });
      await context?.close();
      await browser?.close();
      server?.kill("SIGTERM");
      reply({ success: true, text: "Browser closed" });
      process.exit(0);
    }
    throw new Error(`Unsupported request type: ${request.type}`);
  } catch (error) {
    reply({ success: false, error: error instanceof Error ? error.message : String(error) });
  }
});
