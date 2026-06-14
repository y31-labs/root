const { chromium } = require("playwright");

void (async () => {
  const target = process.argv[2];
  const errors = [];

  if (!target) {
    throw new Error("A browser URL is required");
  }

  const base = new URL(target);
  if (
    base.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "::1"].includes(base.hostname)
  ) {
    throw new Error("Browser verification is restricted to localhost");
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["http:", "https:"].includes(url.protocol) && url.origin !== base.origin) {
      errors.push(`external request: ${url.href}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();

  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    const url = new URL(frame.url());
    if (url.origin !== base.origin) errors.push(`external navigation: ${url.href}`);
  });

  try {
    await page.goto(base.href, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(500);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  await context.close();
  await browser.close();

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  process.stdout.write(`Browser baseline passed at ${base.href}\n`);
})().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
