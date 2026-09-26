import { expect, test, type Page } from '@playwright/test';
import {
  createGameState,
  serializeSave,
  type GameState,
  type PlayerState,
} from '../src/game-state';
import { BEACONS } from '../src/layout';
import { heightAt } from '../src/world';

interface SavedSnapshot {
  player: { x: number; z: number; health: number };
  beacons: string[];
  collected: string[];
  apples: number;
  kills: number;
  time: number;
}
declare global {
  interface Window {
    __wildreach: {
      snapshot(): SavedSnapshot;
      player(): PlayerState;
      rendering(): { calls: number; triangles: number; width: number; height: number };
    };
  }
}

const player = (page: Page) => page.evaluate(() => window.__wildreach.player());
const snapshot = (page: Page) => page.evaluate(() => window.__wildreach.snapshot());
let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors, 'No uncaught browser exceptions').toEqual([]);
});

async function openJourney(page: Page, state?: GameState) {
  // Saved-game fixtures use the public serializer and are only inserted once;
  // reloads therefore exercise the application's own persistence.
  await page.addInitScript(
    ({ saved }) => {
      localStorage.setItem(
        'wildreach.settings.v1',
        JSON.stringify({ quality: 'low', sound: false }),
      );
      if (saved && !localStorage.getItem('wildreach.journey.v1'))
        localStorage.setItem('wildreach.journey.v1', saved);
    },
    { saved: state ? serializeSave(state) : null },
  );
  await page.goto('/');
  await expect(page.locator('#loading')).toHaveCount(0);
  await expect(page.locator('#world')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__wildreach?.rendering().calls ?? 0))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: /Begin the journey|Continue your journey/ }).click();
  await expect(page.locator('body')).toHaveClass(/playing/);
  await expect(page.locator('#world')).toBeFocused();
}

test('keyboard exploration moves, sprints, jumps, and opens the glider', async ({ page }) => {
  await openJourney(page);
  const start = await player(page);
  await page.keyboard.down('w');
  await expect.poll(async () => start.z - (await player(page)).z).toBeGreaterThan(2);
  await page.keyboard.down('Shift');
  await expect.poll(async () => (await player(page)).stamina).toBeLessThan(94);
  await page.keyboard.up('Shift');
  await page.keyboard.up('w');
  const standing = await player(page);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await player(page)).y - standing.y).toBeGreaterThan(0.2);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await player(page)).mode).toBe('gliding');
  await expect(page.locator('#movement-mode')).toContainText('RIDING THE WIND');
});

test('menus pause movement and maps set shrine and custom waypoints', async ({ page }) => {
  await openJourney(page);
  await page.keyboard.down('w');
  await expect.poll(async () => (await player(page)).z).toBeLessThan(67);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  const paused = await snapshot(page);
  await page.waitForTimeout(400);
  expect(await snapshot(page)).toEqual(paused);
  await page.keyboard.up('w');
  await page.keyboard.down('w');
  await page.waitForTimeout(250);
  expect(await snapshot(page)).toEqual(paused);
  await page.keyboard.up('w');
  await page.getByRole('button', { name: 'Unfold your map' }).click();
  await page.getByRole('button', { name: /Sunspire Shrine/ }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('#target-label')).toHaveText('Sunspire Shrine');
  await page.keyboard.press('m');
  await page.locator('#world-map').click({ position: { x: 90, y: 110 } });
  await expect(page.getByRole('status')).toContainText('Waypoint placed');
  await page.getByRole('button', { name: 'Close menu' }).click();
  await expect(page.locator('#target-label')).toHaveText('Your waypoint');
  await page.getByRole('button', { name: 'Open map', exact: true }).focus();
  const beforeActivation = await player(page);
  await page.keyboard.press('Space');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect((await player(page)).mode).toBe('grounded');
  expect((await player(page)).y).toBeCloseTo(beforeActivation.y);
});

test('the satchel heals from a valid saved game and the F shortcut uses another apple', async ({
  page,
}) => {
  const state = createGameState(heightAt);
  state.player.health = 2;
  await openJourney(page, state);
  await expect(page.locator('#hearts')).toHaveAttribute('aria-label', '2 of 5 hearts');
  await page.keyboard.press('i');
  await expect(page.getByRole('dialog')).toContainText('Your satchel');
  await page.getByRole('button', { name: 'Eat apple' }).click();
  await expect(page.locator('#hearts')).toHaveAttribute('aria-label', '4 of 5 hearts');
  await expect(page.getByRole('dialog')).toContainText('PROVISIONS · ×2');
  await page.keyboard.press('f');
  await expect(page.locator('#hearts')).toHaveAttribute('aria-label', '5 of 5 hearts');
  await expect(page.locator('#apple-count')).toHaveText('1');
  await expect(page.getByRole('dialog')).toContainText('PROVISIONS · ×1');
  await expect(page.getByRole('button', { name: 'Health is full' })).toBeDisabled();
});

test('a new journey replaces saved discoveries and resumes autosaving after an older run', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const state = createGameState(heightAt);
  state.time = 90;
  state.beacons = ['windward'];
  state.collected = ['r1', 'r2'];
  await openJourney(page, state);
  await expect.poll(async () => (await snapshot(page)).time).toBeGreaterThan(90.1);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'New journey', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Start a new journey?');
  await page.getByRole('button', { name: 'Start a new journey', exact: true }).click();
  const stored = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('wildreach.journey.v1')!) as SavedSnapshot);
  await expect.poll(async () => (await stored()).time).toBe(0);
  expect((await stored()).beacons).toEqual([]);
  expect((await stored()).collected).toEqual([]);
  await expect(page.locator('#quest-progress')).toContainText('0 / 3');
  // Reduce raster work while observing the actual autosave loop on software WebGL.
  await page.setViewportSize({ width: 320, height: 240 });
  await expect
    .poll(async () => (await snapshot(page)).time, { timeout: 60_000 })
    .toBeGreaterThan(5);
  await expect.poll(async () => (await stored()).time).toBeGreaterThan(1);
});

test('awakening a shrine persists its progress across a browser reload', async ({ page }) => {
  const state = createGameState(heightAt);
  state.player.x = BEACONS[0].x;
  state.player.z = BEACONS[0].z + 5;
  await openJourney(page, state);
  await expect(page.locator('#interaction-prompt')).toContainText('Awaken Windward Shrine');
  await page.keyboard.press('e');
  await expect(page.locator('#quest-progress')).toContainText('1 / 3');
  await expect
    .poll(async () =>
      page.evaluate(() => JSON.parse(localStorage.getItem('wildreach.journey.v1')!).beacons),
    )
    .toEqual(['windward']);
  await page.reload();
  await expect(page.locator('#loading')).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue your journey' }).click();
  await expect(page.locator('#quest-progress')).toContainText('1 / 3');
  await expect(page.locator('#target-label')).toHaveText('Stillwater Shrine');
});

test('awakening the final shrine completes the quest and exploration can continue', async ({
  page,
}) => {
  const state = createGameState(heightAt);
  state.beacons = ['windward', 'stillwater'];
  state.player.x = BEACONS[2].x;
  state.player.z = BEACONS[2].z + 5;
  await openJourney(page, state);
  await expect(page.locator('#interaction-prompt')).toContainText('Awaken Sunspire Shrine');
  await page.keyboard.press('e');
  await expect(page.locator('#quest-progress')).toContainText('3 / 3');
  await expect(page.getByRole('dialog')).toContainText('The valley remembers.');
  await expect(page.getByRole('dialog')).toContainText('SHRINES AWAKENED');
  await expect
    .poll(async () => (await snapshot(page)).beacons)
    .toEqual(['windward', 'stillwater', 'sunspire']);
  await page.getByRole('button', { name: 'There’s more to discover' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('#quest-description')).toHaveText('Light has returned to the valley.');
});

test.describe('touch exploration', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });

  test('mobile controls jump, glide, and open the map without horizontal overflow', async ({
    page,
  }) => {
    await openJourney(page);
    await expect(page.getByLabel('Movement joystick')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sprint', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Jump or glide' }).tap();
    await expect.poll(async () => (await player(page)).mode).toBe('airborne');
    await page.getByRole('button', { name: 'Jump or glide' }).tap();
    await expect.poll(async () => (await player(page)).mode).toBe('gliding');
    await page.getByRole('button', { name: 'Open map', exact: true }).tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('#world-map')).toBeVisible();
    const width = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(width.content).toBeLessThanOrEqual(width.viewport);
    await page.getByRole('button', { name: 'Close menu' }).tap();
    await expect(page.getByRole('dialog')).toBeHidden();
  });
});
