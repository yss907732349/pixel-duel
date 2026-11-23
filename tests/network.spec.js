const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const out = path.resolve(__dirname, '../artifacts');
fs.mkdirSync(out, { recursive: true });
const password = 'duel-room-2468';

function collectErrors(page, errors) {
  page.on('pageerror', error => errors.push(error.message));
}

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.duel && document.querySelector('#arena canvas'));
}

async function createRoom(page) {
  await page.locator('#room-create-password').fill(password);
  await page.locator('#room-create').click();
  await expect(page.locator('#room-session')).toBeVisible();
  await expect(page.locator('#room-number')).toHaveText(/^\d{6}$/);
  return page.locator('#room-number').textContent();
}

async function readyBoth(first, second) {
  // DOM clicks exercise the actual controls without changing the active browser
  // window: switching windows deliberately pauses this game's online match.
  await first.locator('#room-ready').evaluate(button => button.click());
  await second.locator('#room-ready').evaluate(button => button.click());
  await expect(first.locator('#game-overlay')).toBeHidden();
  await expect(second.locator('#game-overlay')).toBeHidden();
  await expect.poll(() => Promise.all([first, second].map(page =>
    page.evaluate(() => duel.match.paused)))).toEqual([false, false]);
}

async function pressWithoutChangingWindows(page, code, key) {
  // Dispatch browser keyboard events into the real input listener. Never edit
  // either match or send network packets directly to manufacture game state.
  await page.evaluate(({ code, key }) => {
    document.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true }));
  }, { code, key });
  await page.waitForTimeout(65);
  await page.evaluate(({ code, key }) => {
    document.dispatchEvent(new KeyboardEvent('keyup', { code, key, bubbles: true, cancelable: true }));
  }, { code, key });
}

async function positions(page) {
  return page.evaluate(() => duel.match.players.map(player => ({ x: player.x, y: player.y })));
}

async function expectPositions(first, second, wanted) {
  await expect.poll(() => Promise.all([positions(first), positions(second)]),
    { intervals: [30, 50, 100] }).toEqual([wanted, wanted]);
}

test('password room synchronizes two browsers, controls, damage, pause and reload recovery', async ({ browser, baseURL }) => {
  test.setTimeout(60000);
  const firstContext = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1100 } });
  const secondContext = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1100 } });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  const errors = [];
  collectErrors(first, errors);
  collectErrors(second, errors);
  try {
    await boot(first);
    await boot(second);
    const code = await createRoom(first);
    await expect(first.locator('#room-seat')).toContainText('你是 P1');
    await expect(first.locator('#room-ready')).toBeDisabled();
    await second.locator('#room-code').fill(code);
    await second.locator('#room-join-password').fill('wrong-password');
    await second.locator('#room-join').click();
    await expect(second.locator('#room-message')).toContainText('密码不正确');
    await expect(second.locator('#room-entry')).toBeVisible();
    await second.locator('#room-join-password').fill(password);
    await second.locator('#room-join').click();
    await expect(second.locator('#room-session')).toBeVisible();
    await expect(second.locator('#room-seat')).toContainText('你是 P2');
    await expect(second.locator('#room-number')).toHaveText(code);
    await expect(first.locator('#room-member-1')).toContainText('已入房');
    await expect(first.locator('#room-ready')).toBeEnabled();
    await expect(first.locator('[data-mode="training"]')).toBeDisabled();
    await expect.poll(() => first.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await first.screenshot({ path: path.join(out, 'rooms-desktop.png'), fullPage: true });

    // One actual Playwright key press plus normal DOM keyboard events for the
    // other independent browser: both clients use WASD for their assigned seat.
    await first.bringToFront();
    await readyBoth(first, second);
    await first.keyboard.press('d');
    await expectPositions(first, second, [{ x: 6, y: 5 }, { x: 11, y: 5 }]);
    await pressWithoutChangingWindows(second, 'KeyA', 'a');
    await expectPositions(first, second, [{ x: 6, y: 5 }, { x: 10, y: 5 }]);

    // P1 cannot move P2 with the old local second-player controls.
    await pressWithoutChangingWindows(first, 'ArrowLeft', 'ArrowLeft');
    await expectPositions(first, second, [{ x: 6, y: 5 }, { x: 10, y: 5 }]);
    await first.waitForTimeout(240);
    await pressWithoutChangingWindows(first, 'KeyD', 'd');
    await expectPositions(first, second, [{ x: 7, y: 5 }, { x: 10, y: 5 }]);
    await pressWithoutChangingWindows(first, 'KeyK', 'k');
    await expect.poll(() => Promise.all([first, second].map(page => page.evaluate(() => {
      const attack = duel.match.attacks.find(attack => attack.owner === 0 && attack.kind === 'skill');
      return attack ? attack.cells : null;
    }))), { intervals: [20, 30, 40], timeout: 1500 }).toEqual([
      [{ x: 8, y: 5 }, { x: 9, y: 5 }, { x: 10, y: 5 }],
      [{ x: 8, y: 5 }, { x: 9, y: 5 }, { x: 10, y: 5 }]
    ]);
    await expect.poll(() => Promise.all([first, second].map(page =>
      page.evaluate(() => duel.match.players.map(player => player.hp))))).toEqual([[200, 176], [200, 176]]);
    await expect(first.locator('#hp-label-1')).toHaveText('176 / 200');
    await expect(second.locator('#hp-label-1')).toHaveText('176 / 200');

    await first.locator('#pause').evaluate(button => button.click());
    await expect(first.locator('#game-overlay')).toBeVisible();
    await expect(second.locator('#game-overlay')).toBeVisible();
    await expect(first.locator('#overlay-title')).toHaveText('剑歇，稍候。');
    const pausedTimes = await Promise.all([first, second].map(page => page.evaluate(() => duel.match.time)));
    await first.waitForTimeout(180);
    expect(await Promise.all([first, second].map(page => page.evaluate(() => duel.match.time)))).toEqual(pausedTimes);
    await readyBoth(first, second);
    await expect.poll(() => first.evaluate(() => duel.match.time)).toBeGreaterThan(pausedTimes[0]);

    const session = await second.evaluate(() => JSON.parse(sessionStorage.getItem('duel-room')));
    await second.reload();
    await second.waitForFunction(() => window.duel?.network?.active);
    await expect(second.locator('#room-number')).toHaveText(code);
    await expect(second.locator('#room-seat')).toContainText('你是 P2');
    expect(await second.evaluate(() => JSON.parse(sessionStorage.getItem('duel-room')).token)).toBe(session.token);
    await expect(first.locator('#game-overlay')).toBeVisible();
    await expect(second.locator('#game-overlay')).toBeVisible();
    await expect(second.locator('#hp-label-1')).toHaveText('176 / 200');
    await readyBoth(first, second);
    await expect.poll(() => Promise.all([first, second].map(page =>
      page.evaluate(() => duel.match.players[1].hp)))).toEqual([176, 176]);

    await second.locator('#room-leave').click();
    await expect(second.locator('#room-entry')).toBeVisible();
    await expect(second.locator('#room-session')).toBeHidden();
    await expect(second.locator('[data-mode="training"]')).toBeEnabled();
    await expect(second.locator('#round-label')).toHaveText('自由对决');
    expect(await second.evaluate(() => sessionStorage.getItem('duel-room'))).toBeNull();
    await expect(first.locator('#room-member-1')).toContainText('等待加入');
    await expect(first.locator('#room-ready')).toBeDisabled();
    await second.locator('#start').click();
    await expect(second.locator('#game-overlay')).toBeHidden();
    await first.locator('#room-leave').evaluate(button => button.click());
    expect(errors, 'Both independent browsers have no JavaScript errors').toEqual([]);
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test('room interface fits a 390px screen and creates a waiting room', async ({ page }) => {
  const errors = [];
  collectErrors(page, errors);
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await expect(page.locator('#room-entry')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await createRoom(page);
  await expect(page.locator('#room-message')).toContainText('等待对方加入');
  await expect(page.locator('#room-ready')).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(out, 'rooms-mobile.png'), fullPage: true });
  await page.locator('#room-leave').click();
  await expect(page.locator('#room-entry')).toBeVisible();
  expect(errors, 'Mobile room interface has no JavaScript errors').toEqual([]);
});
