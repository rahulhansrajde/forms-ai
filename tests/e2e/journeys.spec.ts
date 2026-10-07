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
  const result = page.getByRole('log', { name: 'Conversation' }).getByRole('region', { name: 'Google Form created' });
  await expect(result).toContainText('Google Form created successfully. Your form is ready.');
  await expect(result.getByRole('link', { name: 'Open form' })).toHaveAttribute('href', /viewform$/);
  await expect(result.getByRole('link', { name: 'Open editor' })).toHaveAttribute('href', /\/edit$/);
  await expect(result.getByRole('img', { name: /QR code that opens the form/ })).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Open form' })).toHaveCount(0);
  await expect(panel.getByText(/created successfully/)).toHaveCount(0);
  await expect(panel.getByLabel('Form title')).toBeEditable();

  await page.reload();
  await expect(page.getByRole('region', { name: 'Google Form created' })).toBeVisible();
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
  const log = page.getByRole('log', { name: 'Conversation' });
  await expect(log.getByRole('region', { name: 'Google Form created' })).toBeVisible();
  await expect(log.getByText(/could not be created/)).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Open form' })).toHaveCount(0);
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
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/chat$/);
});

test('settings Back returns to the page that opened it', async ({ page }) => {
  await signUp(page);
  await sendMessage(page, 'Create a feedback form for students.');
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  const conversationUrl = page.url();
  await expect(page.getByRole('banner').getByRole('button', { name: /preview/i })).toHaveCount(0);
  await openPreview(page);
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: /Settings/ }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByRole('tab', { name: 'Security' }).click();
  await page.getByRole('tab', { name: 'Preferences' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(conversationUrl);
  await expect(page.getByRole('button', { name: 'Show preview' }).first()).toBeVisible();
});

test('login screen renders in the original visual language @responsive', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  const fontFamily = await page.getByRole('button', { name: 'Login' }).evaluate((element) => getComputedStyle(element).fontFamily);
  expect(fontFamily).toContain('Comic Sans');
  await capture(page, `test-results/screens/login-${test.info().project.name}.png`);
});

async function horizontalOverflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const problems: string[] = [];
    if (document.documentElement.scrollWidth > width) {
      problems.push(`page is ${document.documentElement.scrollWidth - width}px wider than the viewport`);
    }
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      if (element.closest('[aria-hidden="true"], [inert]')) {
        continue;
      }
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0 || rect.width === 0 || rect.height === 0) {
        continue;
      }
      if (rect.right <= width + 1 && rect.left >= -1) {
        continue;
      }
      let contained = false;
      for (let parent = element.parentElement; parent && !contained; parent = parent.parentElement) {
        const parentRect = parent.getBoundingClientRect();
        contained = getComputedStyle(parent).overflowX !== 'visible' && parentRect.right <= width + 1 && parentRect.left >= -1;
      }
      if (!contained) {
        problems.push(`${element.tagName.toLowerCase()} "${(element.textContent ?? '').trim().slice(0, 40)}" spans ${Math.round(rect.left)}..${Math.round(rect.right)}`);
      }
    }
    return problems.slice(0, 5);
  });
}

async function expectToFit(page: Page, screen: string): Promise<void> {
  await page.waitForTimeout(400);
  expect(await horizontalOverflow(page), `${screen} at ${page.viewportSize()?.width}px`).toEqual([]);
}

test('a chat can be deleted with a five-second undo window and stays deleted', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signUp(page);
  await sendMessage(page, 'Create a contact form.');
  await page.goto('/chat');
  await sendMessage(page, 'Create a feedback form for students.');
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
  await page.getByRole('switch', { name: 'Dark mode' }).click();
  await page.getByRole('button', { name: 'Open sidebar' }).click();
  const history = page.getByRole('navigation', { name: 'Previous conversations' });
  const entries = history.getByRole('link');
  await expect(entries).toHaveCount(2);
  const openTitle = (await history.locator('[aria-current="page"] span').first().innerText()).trim();

  await history.getByRole('listitem').filter({ hasText: openTitle }).hover();
  await history.getByRole('button', { name: `Delete chat “${openTitle}”` }).click();
  const undo = history.getByRole('button', { name: `Undo deleting “${openTitle}”` });
  await expect(undo).toBeFocused();
  await expect(history.getByText('5', { exact: true })).toBeVisible();
  await expect(history.getByText('3', { exact: true })).toBeVisible({ timeout: 3_000 });
  await undo.click();
  await expect(entries).toHaveCount(2);
  await page.waitForTimeout(5_500);
  await page.reload();
  await page.getByRole('button', { name: 'Open sidebar' }).click();
  await expect(entries).toHaveCount(2);

  await history.getByRole('listitem').filter({ hasText: openTitle }).hover();
  await history.getByRole('button', { name: `Delete chat “${openTitle}”` }).click();
  await expect(page.getByLabel('Message Forms AI')).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Start a new chat' })).toBeAttached({ timeout: 9_000 });
  await expect(page).toHaveURL(/\/chat$/);
  await expect(entries).toHaveCount(1);
  await page.reload();
  await page.getByRole('button', { name: 'Open sidebar' }).click();
  await expect(entries).toHaveCount(1);
  await expect(history.getByText(openTitle)).toHaveCount(0);
});

test('every screen fits phone, tablet and desktop widths in both themes', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await signUp(page);
  await sendMessage(page, 'Create a volunteer sign up form for a weekend community garden clean-up with contact details and t-shirt size.');
  const conversationUrl = page.url();
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => localStorage.setItem('forms-ai.theme', value), theme);
    for (const width of [320, 375, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
      await page.goto('/chat');
      await expectToFit(page, `${theme} new chat`);
      await page.goto(conversationUrl);
      await expectToFit(page, `${theme} conversation`);
      await page.getByRole('button', { name: 'Open sidebar' }).click();
      await expectToFit(page, `${theme} chat history`);
      await page.getByRole('button', { name: /^Delete chat/ }).first().click({ force: true });
      await expectToFit(page, `${theme} delete countdown`);
      await page.getByRole('button', { name: /^Undo deleting/ }).click();
      await page.getByRole('button', { name: 'Close sidebar' }).click();
      await openPreview(page);
      await expectToFit(page, `${theme} preview`);
      await page.getByRole('button', { name: 'Close preview' }).click();
      await page.getByRole('button', { name: /Account menu/ }).click();
      await expectToFit(page, `${theme} profile menu`);
      await page.keyboard.press('Escape');
      for (const section of ['Profile', 'Security', 'Google Forms', 'Preferences']) {
        await page.goto('/settings');
        await page.getByRole('tab', { name: section }).click();
        await expectToFit(page, `${theme} settings ${section}`);
      }
    }
  }
  const auth = await page.context().browser()!.newPage();
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [320, 375, 390, 430, 1440]) {
      await auth.setViewportSize({ width, height: 800 });
      await auth.goto('/login');
      await auth.evaluate((value) => localStorage.setItem('forms-ai.theme', value), theme);
      await auth.reload();
      await expectToFit(auth, `${theme} login`);
      await auth.goto('/signup');
      await expectToFit(auth, `${theme} signup`);
    }
  }
  await auth.close();
});
test('the new chat heading and composer are centred as one group below the header', async ({ page }) => {
  await signUp(page);
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [768, 1024],
    [390, 844],
    [844, 390],
    [320, 568],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/chat');
    await page.waitForTimeout(500);
    const layout = await page.evaluate(() => {
      const box = (element: Element | null) => element!.getBoundingClientRect();
      const main = box(document.querySelector('#workspace-main'));
      const heading = document.querySelector('p[data-phase]')!;
      const hero = box(heading.parentElement);
      const phrase = box(heading);
      const composer = box(document.querySelector('form:has(textarea)'));
      const send = box(document.querySelector('form:has(textarea) button[type="submit"]'));
      return { main, hero, phrase, composer, send };
    });
    const label = `${width}x${height}`;
    const groupCentre = (layout.hero.top + layout.composer.bottom) / 2;
    const areaCentre = (layout.main.top + layout.main.bottom) / 2;
    expect(Math.abs(groupCentre - areaCentre), `${label} vertical centre`).toBeLessThanOrEqual(2);
    const mainCentreX = (layout.main.left + layout.main.right) / 2;
    expect(Math.abs((layout.phrase.left + layout.phrase.right) / 2 - mainCentreX), `${label} heading centre`).toBeLessThanOrEqual(2);
    expect(Math.abs((layout.composer.left + layout.composer.right) / 2 - mainCentreX), `${label} composer centre`).toBeLessThanOrEqual(2);
    expect(layout.hero.top, `${label} heading below header`).toBeGreaterThanOrEqual(layout.main.top);
    expect(layout.send.right, `${label} send button inside composer`).toBeLessThanOrEqual(layout.composer.right);
    expect(layout.composer.left, `${label} composer left padding`).toBeGreaterThanOrEqual(12);
    await expectToFit(page, `new chat ${label}`);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/chat');
  await sendMessage(page, 'Create a contact form.');
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
});

test('security settings end with the password form and log out stays in the profile menu', async ({ page }) => {
  await signUp(page);
  await page.goto('/settings?section=security');
  const panel = page.getByRole('tabpanel');
  await expect(panel.getByRole('heading', { name: 'Security' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Change password' })).toBeVisible();
  await expect(panel.getByText('Session', { exact: true })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Log out' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0);
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
});