import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const routes = [
  '',
  'about/',
  'recalls/',
  'recalls/1/',
  'recalls/2/',
  'hazards/',
  'hazards/entrapment/',
  'hazards/fall/2/',
  'products/',
  'products/sleep/',
  'products/sleep/2/',
  'products/stroller/',
];
const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

for (const route of routes) {
  test(`accessible landmarks, contrast and reflow: /${route}`, async ({ page }) => {
    await page.goto(route);
    if (route === 'recalls/') await expect(page.getByRole('searchbox')).toBeVisible();
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    const scan = () => new AxeBuilder({ page }).withTags(tags).analyze();
    expect((await scan()).violations).toEqual([]);

    for (const target of await page
      .locator('nav a, .btn:not([href="#main"]), a.badge, input, select')
      .all()) {
      if (!(await target.isVisible())) continue;
      const box = await target.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(24);
      expect(box?.height).toBeGreaterThanOrEqual(24);
    }

    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    const skipBox = await skip.boundingBox();
    expect(skipBox?.width).toBeGreaterThanOrEqual(24);
    expect(skipBox?.height).toBeGreaterThanOrEqual(24);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();

    // 320 CSS pixels is the WCAG reflow width (equivalent to 400% at 1280px).
    await page.setViewportSize({ width: 320, height: 800 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    expect((await scan()).violations).toEqual([]);

    await page.addStyleTag({
      content:
        '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }',
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  });
}

test('search is keyboard operable and announces results without moving focus', async ({ page }) => {
  await page.goto('recalls/?q=AC-123');
  const search = page.getByRole('searchbox');
  await expect(search).toHaveValue('AC-123');
  await expect(page.getByRole('status')).toHaveText('1 of 2 recalls match.');
  await search.focus();
  await search.fill('no-such-product');
  await expect(page.getByRole('status')).toHaveText('0 of 2 recalls match.');
  await expect(search).toBeFocused();
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  await search.fill('');
  const type = page.getByRole('combobox', { name: 'Product type' });
  const hazard = page.getByRole('combobox', { name: 'Hazard' });
  await page.keyboard.press('Tab');
  await expect(type).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(hazard).toBeFocused();
  await page.keyboard.press('e');
  await expect(hazard).toHaveValue('entrapment');
  await expect(page.getByRole('status')).toHaveText('1 of 2 recalls match.');
  await expect(hazard).toBeFocused();
});

test('product type filter reads from and writes to the URL', async ({ page }) => {
  await page.goto('recalls/?type=stroller');
  const type = page.getByRole('combobox', { name: 'Product type' });
  await expect(type).toHaveValue('stroller');
  await expect(page.getByRole('status')).toHaveText('1 of 2 recalls match.');
  await type.selectOption('sleep');
  await expect(page.getByRole('status')).toHaveText('2 of 2 recalls match.');
  await expect(page).toHaveURL(/[?&]type=sleep\b/);
  await type.selectOption('');
  await expect(page.getByRole('status')).toHaveText('2 recalls, newest first.');
  await expect(page).not.toHaveURL(/type=/);
});

for (const section of ['products/sleep', 'hazards/fall']) {
  test(`${section} pages link to each other in order`, async ({ page }) => {
    await page.goto(`${section}/`);
    const pages = page.getByRole('navigation', { name: 'Pages' });
    await expect(pages.getByRole('link', { name: 'Page 1' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await pages.getByRole('link', { name: 'Next →' }).click();
    await expect(page).toHaveURL(new RegExp(`${section}/2/$`));
    await expect(page.getByText('showing 2–2')).toBeVisible();
    await expect(pages.getByRole('link', { name: 'Next →' })).toHaveCount(0);
    await pages.getByRole('link', { name: '← Previous' }).click();
    await expect(page).toHaveURL(new RegExp(`${section}/$`));
  });
}

test('hazard pages link into search filtered to that hazard', async ({ page }) => {
  await page.goto('hazards/entrapment/');
  await page.getByRole('link', { name: 'search within these recalls' }).click();
  await expect(page.getByRole('combobox', { name: 'Hazard' })).toHaveValue('entrapment');
  await expect(page.getByRole('status')).toHaveText('1 of 2 recalls match.');
});

test('recall pages lead with what to do and jump to the company contact', async ({ page }) => {
  await page.goto('recalls/1/');
  const headings = await page
    .getByRole('main')
    .getByRole('heading', { level: 2 })
    .allTextContents();
  expect(headings.slice(0, 2)).toEqual(['What to do', 'Products and model numbers']);
  await page.getByRole('link', { name: 'Company contact details' }).click();
  await expect(page).toHaveURL(/#contact$/);
  await expect(page.locator('#contact')).toBeInViewport();
});

test('photo slider moves between photos by button and keeps focus at the ends', async ({
  page,
}) => {
  await page.goto('recalls/1/');
  const slider = page.getByRole('region', { name: 'Product photos' });
  const counter = slider.locator('[data-counter]');
  const next = slider.getByRole('button', { name: 'Next photo' });
  const previous = slider.getByRole('button', { name: 'Previous photo' });
  await expect(counter).toHaveText('Photo 1 of 3');
  await expect(previous).toHaveAttribute('aria-disabled', 'true');

  await next.focus();
  await page.keyboard.press('Enter');
  await expect(counter).toHaveText('Photo 2 of 3');
  await expect(slider.getByRole('img').nth(1)).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(counter).toHaveText('Photo 3 of 3');
  await expect(next).toHaveAttribute('aria-disabled', 'true');
  await expect(next).toBeFocused();

  await previous.click();
  await expect(counter).toHaveText('Photo 2 of 3');
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
});

test('without JavaScript every photo is still in the page and no dead buttons appear', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto('http://127.0.0.1:4322/astro-baby-item-recalls/recalls/1/');
    const slider = page.getByRole('region', { name: 'Product photos' });
    await expect(slider.getByRole('img')).toHaveCount(3);
    await expect(slider.getByRole('button')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('without JavaScript all recalls remain readable and no nonfunctional filters appear', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto('http://127.0.0.1:4322/astro-baby-item-recalls/recalls/');
    await expect(page.getByRole('searchbox')).toBeHidden();
    await expect(page.locator('noscript p')).toBeVisible();
    await expect(page.locator('noscript p')).toContainText('Filtering requires JavaScript.');
    await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveCount(2);
  } finally {
    await context.close();
  }
});

test('focus remains visible with forced colors and reduced motion', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.goto('');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  const input = page.getByRole('searchbox');
  await expect(input).toBeFocused();
  const focus = await input.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      width: style.outlineWidth,
      style: style.outlineStyle,
      transition: style.transitionDuration,
    };
  });
  expect(focus).toEqual({ width: '3px', style: 'solid', transition: '0s' });
});
