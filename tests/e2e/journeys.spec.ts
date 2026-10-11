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
  await expect(page.getByText('Google connected.', { exact: false })).toBeVisible();
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
  await page.getByRole('tab', { name: 'Google' }).click();
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
      for (const section of ['Profile', 'Security', 'Google', 'Preferences']) {
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

test('journey 8: create and change a Google Sheet only through explicit buttons, and read it without one', async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page);
  await page.goto('/auth/google?returnTo=/settings');
  const permissions = page.getByRole('list', { name: 'Google permissions' });
  await expect(permissions.getByText('Allowed')).toHaveCount(2);

  await page.goto('/chat');
  await sendMessage(page, 'Create a spreadsheet called Event Leads with columns Name, Email, Phone');
  const log = page.getByRole('log', { name: 'Conversation' });
  const proposal = log.getByRole('region', { name: 'New Google Sheet “Event Leads”' });
  await expect(proposal).toContainText('with columns Name, Email, Phone');
  await expect(log.getByRole('link', { name: 'Open sheet' })).toHaveCount(0);
  await proposal.getByRole('button', { name: 'Create Google Sheet' }).click();

  const created = log.getByRole('region', { name: 'Google Sheets result for “Event Leads”' }).first();
  await expect(created).toContainText('Google Sheet created successfully. “Event Leads” is ready.');
  const open = created.getByRole('link', { name: 'Open sheet' });
  await expect(open).toHaveAttribute('href', /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[^/]+\/edit$/);
  await expect(open).toHaveAttribute('target', '_blank');
  await expect(proposal.getByText('Created in Google Sheets')).toBeVisible();

  await sendMessage(page, 'Clear column B');
  const change = log.getByRole('region', { name: 'Changes to “Event Leads”' });
  await expect(change.getByText('Removes data')).toBeVisible();
  await change.getByRole('button', { name: 'Apply changes' }).click();
  const dialog = page.getByRole('dialog', { name: 'Remove data from Google Sheets?' });
  await expect(dialog).toContainText('Email');
  await expect(dialog).not.toContainText('B2:B');
  await dialog.getByRole('button', { name: 'Yes, apply changes' }).click();
  await expect(change.getByText('Changes applied')).toBeVisible();

  await sendMessage(page, 'Show me the first 5 rows');
  const table = log.getByRole('region', { name: 'Values from Sheet1 · header row only' });
  await expect(table.getByRole('columnheader')).toHaveText(['Name', 'Email', 'Phone']);
  await expect(log.getByRole('button', { name: /Read sheet/ })).toHaveCount(0);
  await expect(log.getByText(/Click Read sheet/)).toHaveCount(0);

  const conversationUrl = page.url();
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => localStorage.setItem('forms-ai.theme', value), theme);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(conversationUrl);
      await expect(page.getByRole('region', { name: 'Values from Sheet1 · header row only' })).toBeVisible();
      await expectToFit(page, `${theme} sheets conversation`);
    }
  }
  await capture(page, 'test-results/screens/sheets-desktop.png');
  await expect(page.getByRole('region', { name: /Google Sheets result for/ })).toHaveCount(3);
  await expect(page.getByRole('region', { name: 'New Google Sheet “Event Leads”' }).getByText('Created in Google Sheets')).toBeVisible();
});

test('journey 9: link an existing Google Sheet by URL and work on it', async ({ page }) => {
  test.setTimeout(120_000);
  const existingUrl = 'https://docs.google.com/spreadsheets/d/1HackathonRegistrations0123456789abcdefXYZ/edit';
  await signUp(page);
  await page.goto('/auth/google?returnTo=/settings');
  await expect(page.getByRole('list', { name: 'Google permissions' }).getByText('Allowed')).toHaveCount(2);
  await page.goto('/chat');

  await sendMessage(page, 'Create a spreadsheet called Event Leads with columns Name, Email');
  const log = page.getByRole('log', { name: 'Conversation' });
  await log.getByRole('region', { name: 'New Google Sheet “Event Leads”' }).getByRole('button', { name: 'Create Google Sheet' }).click();
  await expect(log.getByRole('region', { name: 'Google Sheets result for “Event Leads”' })).toBeVisible();

  await sendMessage(page, `Use this Google Sheet: ${existingUrl}`);
  const found = log.getByRole('region', { name: 'Google Sheet found' });
  await expect(found).toContainText('Hackathon Registrations');
  await expect(found).toContainText('Registrations, Analytics');
  await found.getByRole('button', { name: 'Connect Google Sheet' }).click();
  const connected = log.getByRole('region', { name: 'Google Sheets result for “Hackathon Registrations”' }).first();
  await expect(connected).toContainText('Google Sheet connected successfully.');
  await expect(connected.getByRole('link', { name: 'Open sheet' })).toHaveAttribute('href', existingUrl);
  await expect(found.getByText('Connected to this chat')).toBeVisible();

  await sendMessage(page, 'Read the first 20 rows');
  const table = log.getByRole('region', { name: 'Values from Registrations · 2 data rows · header row included' });
  await expect(table.getByRole('columnheader')).toHaveText(['Name', 'Email', 'College']);
  await expect(table.getByRole('cell', { name: 'Alan Turing' })).toBeVisible();

  await sendMessage(page, 'Add a Phone Number column after Email');
  const change = log.getByRole('region', { name: 'Changes to “Hackathon Registrations”' });
  await change.getByRole('button', { name: 'Apply changes' }).click();
  await expect(change.getByText('Changes applied')).toBeVisible();

  const conversationUrl = page.url();
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => localStorage.setItem('forms-ai.theme', value), theme);
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 820 });
      await page.goto(conversationUrl);
      await expect(page.getByRole('region', { name: 'Google Sheet found' })).toBeVisible();
      await expectToFit(page, `${theme} linked sheet conversation`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('region', { name: 'Google Sheet found' }).scrollIntoViewIfNeeded();
  await capture(page, 'test-results/screens/linked-sheet-mobile-dark.png');
});

test('journey 10: update a student by name and ask for an ID when names repeat', async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page);
  await page.goto('/auth/google?returnTo=/settings');
  await expect(page.getByRole('list', { name: 'Google permissions' }).getByText('Allowed')).toHaveCount(2);
  await page.goto('/chat');
  await sendMessage(page, 'Use this Google Sheet: https://docs.google.com/spreadsheets/d/1StudentRegistrationE2E000000000000000000/edit');
  const log = page.getByRole('log', { name: 'Conversation' });
  await log.getByRole('region', { name: 'Google Sheet found' }).getByRole('button', { name: 'Connect Google Sheet' }).click();
  await expect(log.getByText('Google Sheet connected successfully.', { exact: false })).toBeVisible();

  await sendMessage(page, 'Change Rahul’s Year from 3rd Year to 4th Year.');
  await expect(log.getByText('Rahul is Student ID STU001. I found the record and prepared the update.', { exact: false })).toBeVisible();
  const card = log.getByRole('region', { name: 'Changes to “Forms AI Student Registration”' });
  const step = card.getByRole('listitem').first();
  await expect(step).toContainText("Update Rahul's Year");
  await expect(step).toContainText('3rd Year');
  await expect(step).toContainText('4th Year');
  await expect(card).not.toContainText(/\b[A-Z]{1,3}\d+\b/);
  await card.getByRole('button', { name: 'Apply changes' }).click();
  await expect(card.getByText('Changes applied')).toBeVisible();
  await expect(log.getByText('Updated Rahul\'s Year from “3rd Year” to “4th Year”.', { exact: false })).toBeVisible();

  await sendMessage(page, "Change Ananya's Year to 3rd Year.");
  await expect(log.getByText('I found 2 students named Ananya. Please provide the Student ID or row number.')).toBeVisible();
  await sendMessage(page, 'Her student id is STU004');
  await expect(log.getByText('Student ID STU004 is Ananya.', { exact: false })).toBeVisible();

  await sendMessage(page, 'Show me the first 3 rows from Students');
  await expect(log.getByRole('region', { name: 'Values from Students · 3 data rows · header row included' })).toBeVisible();
  await expect(log.getByText('3 data rows from “Students” (header row included)', { exact: false })).toBeVisible();
  await expect(log.getByRole('button', { name: /Read sheet/ })).toHaveCount(0);
  await expect(log.getByText(/A1:/)).toHaveCount(0);

  await sendMessage(page, "What is Priya's department?");
  const answer = log.getByRole('region', { name: 'Google Sheets result for “Forms AI Student Registration”' }).last();
  await expect(answer).toContainText("Priya's Department is CSE.");
  await expect(answer).not.toContainText('Ananya');
  await expect(answer.getByRole('table')).toHaveCount(0);

  const conversationUrl = page.url();
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => localStorage.setItem('forms-ai.theme', value), theme);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 820 });
      await page.goto(conversationUrl);
      await expect(page.getByText("Update Rahul's Year")).toBeVisible();
      await expectToFit(page, `${theme} record update conversation`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText("Update Rahul's Year").scrollIntoViewIfNeeded();
  await capture(page, 'test-results/screens/record-update-mobile-dark.png');
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