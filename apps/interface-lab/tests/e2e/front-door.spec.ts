import { expect, test } from '@playwright/test';

const prompt =
  'I need a round trip to Porto in late September with a checked bag and the least stressful connection.';

const generatedSurface = {
  title: 'Porto Trip Planner',
  domain: 'travel',
  intent: 'Compare route tradeoffs',
  summary: 'A compact surface for balancing door-to-door time, baggage, and connection stress.',
  backend: {
    kind: 'fallback',
    detail: 'Mocked in the browser flow test.',
  },
  controls: [
    {
      id: 'priority',
      label: 'Priority',
      type: 'select',
      value: 'Door-to-door time',
      options: ['Door-to-door time', 'Fare', 'Connection comfort'],
    },
  ],
  sections: [
    {
      id: 'routes',
      title: 'Route options',
      kind: 'options',
      items: [
        {
          primary: 'Door-to-door balanced option',
          secondary: 'Favor one checked bag and a low-stress connection window.',
          meta: ['Checked bag', 'Low stress'],
          tone: 'success',
        },
      ],
    },
  ],
  actions: [
    {
      label: 'Compare fares',
      intent: 'Open the fare comparison workflow',
      tone: 'neutral',
    },
  ],
  sandbox: {
    provider: 'vercel-sandbox',
    runtime: 'node24',
    port: 3000,
    command: 'bun run dev',
    previewPath: '/',
  },
};

test('presents a readable, scrollable y31 landing page', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  await expect(page.getByTestId('animated-gradient-background')).toBeVisible();
  await expect(page.locator('[data-testid="animated-gradient-background"] canvas')).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('link', { name: 'y31' })).toBeVisible();
  const loginButton = page.getByRole('button', { name: 'Log in' });
  await expect(loginButton).toBeVisible();
  await loginButton.click();
  await expect(page.getByRole('heading', { name: 'Login is on its way.' })).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Describe the work. Get the surface.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      level: 2,
      name: 'Turn a messy thought, decision, or workflow into a focused interface you can use.',
    }),
  ).toBeVisible();
  await expect(
    page.getByTestId('front-prompt').getByRole('button', { name: 'Plan a trip' }),
  ).toBeVisible();

  const promptBox = await page.getByTestId('front-prompt').boundingBox();
  const viewport = page.viewportSize();

  expect(promptBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(Math.abs(promptBox!.x + promptBox!.width / 2 - viewport!.width / 2)).toBeLessThan(80);

  await page.getByTestId('faq-section').scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading', { level: 2, name: 'A little context.' })).toBeVisible();

  const firstFaq = page.getByRole('button', { name: 'What is y31?' });
  await firstFaq.click();
  await expect(page.getByText('y31 is a prompt-first interface layer.')).toBeVisible();

  await page.getByRole('button', { name: 'Is it another chatbot?' }).click();
  await expect(page.getByText('No. The prompt is the entry point, but the output is an interface:')).toBeVisible();
  await expect(page.getByText('y31 is a prompt-first interface layer.')).not.toBeVisible();
});

test('opens a pitch-black workspace when Enter submits the prompt', async ({ page }) => {
  await page.route('**/api/generate', async (route) => {
    const body = route.request().postDataJSON() as { brief?: string };

    expect(body.brief).toBe(prompt);

    await route.fulfill({ json: generatedSurface });
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  const promptField = page.getByLabel('What do you want to work through?');
  await promptField.fill(prompt);
  await expect(page.getByRole('button', { name: 'Open surface' })).toBeEnabled();
  await promptField.press('Enter');

  await expect(page).toHaveURL(/\/workspace\?brief=/);
  await expect(page.getByTestId('workspace-shell')).toBeVisible();
  await expect(page.getByTestId('chat-thread')).toContainText(prompt);
  await expect(page.getByRole('heading', { name: 'Porto Trip Planner' })).toBeVisible();
  await expect(page.getByTestId('app-panel')).toContainText('Door-to-door balanced option');

  const promptBox = await page.getByTestId('workspace-prompt').boundingBox();
  const panelBox = await page.getByTestId('app-panel').boundingBox();

  expect(promptBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(promptBox!.x).toBeLessThan(panelBox!.x);
  expect(panelBox!.width).toBeGreaterThan(promptBox!.width);
});

export {};
