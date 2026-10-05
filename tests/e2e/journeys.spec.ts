import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'Secret123';
let accountCounter = 0;

function uniqueEmail(): string {
  accountCounter += 1;
  return `e2e-${Date.now()}-${accountCounter}@example.com`;
}

async function signUp(page: Page, email = uniqueEmail()): Promise<string> {
  await page.goto('/signup');
  await page.getByLabel('First name').fill('Ada');
  await page.getByLabel('Last name').fill('Lovelace');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('New password').fill(PASSWORD);
  await page.getByLabel('Re-enter password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page.getByRole('heading', { name: 'Start a new chat' })).toBeAttached();
  return email;
}

async function sendMessage(page: Page, text: string): Promise<void> {
  const composer = page.getByLabel('Message Forms AI');
  await composer.fill(text);
  await composer.press('Enter');
  await expect(page.getByText('Thinking')).toHaveCount(0, { timeout: 15_000 });
}

async function capture(page: Page, path: string): Promise<void> {
  await page.waitForTimeout(600);
  await page.screenshot({ path });
}

async function openPreview(page: Page) {
  await page.getByRole('button', { name: 'Show preview' }).first().click();
  const panel = page
    .getByRole('complementary', { name: 'Form draft preview' })
    .or(page.getByRole('dialog', { name: 'Form draft preview' }));
  await expect(panel).toBeVisible();
  return panel;
}

test('journey 1: signup, login and land on New Chat', async ({ page }) => {
  const email = await signUp(page);
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByRole('button', { name: 'Open sidebar' })).toBeVisible();

  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByLabel('Message Forms AI')).toBeVisible();
  await capture(page, 'test-results/screens/new-chat-desktop.png');
});

test('journeys 2 to 5: create, preview, modify, suggest and accept', async ({ page }) => {
  await signUp(page);
  await sendMessage(page, 'Create a college hackathon registration form.');
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/I've created a draft for “College Hackathon Registration”/)).toBeVisible();

  const panel = await openPreview(page);
  await expect(panel.getByLabel('Form title')).toHaveValue('College Hackathon Registration');
  await expect(panel.getByRole('article', { name: /Phone Number/ })).toBeVisible();
  await capture(page, 'test-results/screens/preview-desktop.png');

  await sendMessage(page, 'Remove phone number.');
  await expect(panel.getByRole('article', { name: /Phone Number/ })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: /Version 2 of 2/ })).toBeVisible();

  const questionsBefore = await panel.getByRole('article').count();
  await sendMessage(page, 'What else can I ask?');
  await expect(page.getByText('Here are some questions you could add')).toBeVisible();
  await expect(panel.getByRole('button', { name: /Version 2 of 2/ })).toBeVisible();
  await expect(panel.getByRole('article')).toHaveCount(questionsBefore);

  await sendMessage(page, 'Add those questions.');
  await expect(page.getByText(/I've added \d+ questions? to your form/)).toBeVisible();
  await expect(panel.getByRole('button', { name: /Version 3 of 3/ })).toBeVisible();
  expect(await panel.getByRole('article').count()).toBeGreaterThan(questionsBefore);

  await panel.getByRole('button', { name: 'Close preview' }).click();
  await expect(panel).toBeHidden();
  await sendMessage(page, 'Create it in Google Forms.');
  await expect(page.getByText(/only way a real Google Form gets created/)).toBeVisible();
});

test('journey 6: connect Google through OAuth and create the Google Form', async ({ page }) => {
  await signUp(page);
  await sendMessage(page, 'Create a feedback form for students.');
  let panel = await openPreview(page);
  await panel.getByRole('button', { name: 'Create GForm' }).click();
  await panel.getByRole('link', { name: 'Connect Google Forms' }).click();

  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Google Forms connected.', { exact: false })).toBeVisible();
  panel = page.getByRole('complementary', { name: 'Form draft preview' });
  await expect(panel).toBeVisible();

  await panel.getByRole('button', { name: 'Create GForm' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create a Google Form?' });
  await expect(dialog).toContainText('forms.ai.e2e@gmail.com');
  await dialog.getByRole('button', { name: 'Create GForm' }).click();
  await expect(panel.getByText('Google Form created successfully')).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Open form' })).toHaveAttribute('href', /viewform$/);
  await expect(panel.getByRole('link', { name: 'Open editor' })).toHaveAttribute('href', /\/edit$/);
});

test('journey 7: a failed publish keeps the draft and can be retried', async ({ page }) => {
  await signUp(page);
  await page.goto('/auth/google?returnTo=/settings');
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();

  await page.goto('/chat');
  await sendMessage(page, 'Create a contact form.');
  const panel = await openPreview(page);
  const title = panel.getByLabel('Form title');
  await title.fill('Flaky Contact Form');
  await title.press('Enter');
  await expect(panel.getByRole('button', { name: /Version 2 of 2/ })).toBeVisible();

  await panel.getByRole('button', { name: 'Create GForm' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create GForm' }).click();
  await expect(panel.getByRole('alert')).toContainText('could not add items');
  await expect(title).toHaveValue('Flaky Contact Form');

  await panel.getByRole('button', { name: 'Retry Create GForm' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create GForm' }).click();
  await expect(panel.getByText('Google Form created successfully')).toBeVisible();
});

test('history sidebar lists conversations and reopens one @responsive', async ({ page }) => {
  await signUp(page);
  await capture(page, `test-results/screens/new-chat-${test.info().project.name}.png`);
  await sendMessage(page, 'Create an RSVP form for my party');
  await page.getByRole('button', { name: 'Open sidebar' }).click();
  const sidebar = page.getByRole('complementary', { name: 'Chat history' }).or(page.getByRole('dialog', { name: 'Chat history' }));
  await expect(sidebar.getByText('Today')).toBeVisible();
  await capture(page, `test-results/screens/sidebar-${test.info().project.name}.png`);
  await sidebar.getByRole('button', { name: 'New chat' }).click();
  await expect(page.getByRole('heading', { name: 'Start a new chat' })).toBeAttached();
  await page.getByRole('button', { name: 'Open sidebar' }).click();
  await sidebar.getByRole('link', { name: /Create an RSVP form/ }).click();
  await expect(page.getByText(/I've created a draft for/)).toBeVisible();
  const panel = await openPreview(page);
  await capture(page, `test-results/screens/preview-${test.info().project.name}.png`);
  await panel.getByRole('button', { name: 'Close preview' }).click();
});

test('settings shows profile and Google connection state @responsive', async ({ page }) => {
  await signUp(page);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveAttribute('readonly', '');
  await page.getByRole('tab', { name: 'Google Forms' }).click();
  await expect(page.getByText('Not connected')).toBeVisible();
  await capture(page, `test-results/screens/settings-${test.info().project.name}.png`);
});

test('login screen renders in the original visual language @responsive', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  const fontFamily = await page.getByRole('button', { name: 'Login' }).evaluate((element) => getComputedStyle(element).fontFamily);
  expect(fontFamily).toContain('Comic Sans');
  await capture(page, `test-results/screens/login-${test.info().project.name}.png`);
});
