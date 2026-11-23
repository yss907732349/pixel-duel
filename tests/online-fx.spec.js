const { test, expect } = require('@playwright/test');
const { createDuelServer } = require('../server.cjs');
const path = require('node:path');
const fs = require('node:fs');

const out = path.resolve(__dirname, '../artifacts');
fs.mkdirSync(out, { recursive: true });

async function readyBoth(pages) {
  for (const page of pages) await page.locator('#room-ready').evaluate(button => button.click());
  for (const page of pages) await expect(page.locator('#game-overlay')).toBeHidden();
}

async function roomFixture(browser) {
  const app = createDuelServer();
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${app.server.address().port}/`;
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 1440, height: 1100 } })));
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  const errors = [];
  for (const page of pages) {
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => window.duel?.screenFX && document.querySelector('#arena canvas'));
    await page.evaluate(() => {
      window.observedFX = [];
      window.observedSnapshots = 0;
      const trigger = duel.screenFX.trigger.bind(duel.screenFX);
      duel.screenFX.trigger = (event, match, now) => {
        observedFX.push({ id: event.id, type: event.type });
        return trigger(event, match, now);
      };
      const state = duel.network.callbacks.state;
      duel.network.callbacks.state = data => { observedSnapshots++; return state(data); };
    });
  }
  await pages[0].locator('#room-create-password').fill('online-fx-9077');
  await pages[0].locator('#room-create').click();
  await expect(pages[0].locator('#room-session')).toBeVisible();
  const code = await pages[0].locator('#room-number').textContent();
  await pages[1].locator('#room-code').fill(code);
  await pages[1].locator('#room-join-password').fill('online-fx-9077');
  await pages[1].locator('#room-join').click();
  await expect(pages[1].locator('#room-session')).toBeVisible();
  await readyBoth(pages);
  return {
    app, pages, room: app.rooms.get(code), errors,
    async close() { for (const context of contexts) await context.close(); await app.close(); }
  };
}

function attackFixture(room, kind) {
  const match = room.match;
  Object.assign(match.players[0], kind === 'blink'
    ? { x: 7, y: 3, facing: { x: 0, y: 1 } }
    : { x: 6, y: 5, facing: { x: -1, y: 0 } });
  Object.assign(match.players[1], { x: 5, y: 5, facing: { x: 1, y: 0 } });
  for (const player of match.players) { player.drawX = player.x; player.drawY = player.y; }
  // These are genuine rule-engine actions on the authoritative server. The
  // clients only receive the same ongoing snapshots as an ordinary online room.
  expect(match.act(1, 'skill')).toBe(true);
  match.step(.18);
  expect(match.act(0, kind === 'blink' ? 'dodge' : 'block')).toBe(true);
}

async function waitForEffect(pages, kind) {
  await Promise.all(pages.map(page => page.waitForFunction(kind =>
    duel.screenFX.active.some(effect => effect.type === kind), kind)));
}

async function verifyExpired(pages, kind, eventId, expectedCount) {
  await pages[0].waitForTimeout(950);
  for (const page of pages) {
    await expect(page.locator('#screen-fx')).toBeHidden({ timeout: 700 });
    expect(await page.evaluate(() => duel.screenFX.active.length)).toBe(0);
    expect(await page.locator('.shell').evaluate(el => getComputedStyle(el).transform)).toBe('none');
    expect(await page.evaluate(({ kind, eventId }) => observedFX.filter(event =>
      event.type === kind && event.id === eventId).length, { kind, eventId })).toBe(expectedCount);
  }
}

for (const kind of ['parry', 'blink']) {
  test(`online ${kind} expires once despite repeated snapshots, pause and reused next-round ids`, async ({ browser }) => {
    const fixture = await roomFixture(browser);
    const { room, pages } = fixture;
    try {
      attackFixture(room, kind);
      await waitForEffect(pages, kind);
      const eventId = room.match.events.find(event => event.type === kind).id;
      await pages[0].waitForTimeout(55);
      await pages[0].screenshot({ path: path.join(out, `online-${kind}-active.png`), fullPage: true });
      const snapshots = await pages[0].evaluate(() => observedSnapshots);
      await verifyExpired(pages, kind, eventId, 1);
      expect(await pages[0].evaluate(() => observedSnapshots)).toBeGreaterThan(snapshots + 10);
      await pages[0].screenshot({ path: path.join(out, `online-${kind}-expired.png`), fullPage: true });

      await pages[0].locator('#pause').evaluate(button => button.click());
      for (const page of pages) await expect(page.locator('#game-overlay')).toBeVisible();
      await readyBoth(pages);
      await verifyExpired(pages, kind, eventId, 1);

      // A new round legitimately reuses core event IDs and must be allowed to
      // play the same effect again, while the current round must never replay it.
      room.match.reset('duel');
      room.round++;
      room.phase = 'playing';
      room.endingSent = false;
      await expect.poll(() => pages[0].evaluate(() => duel.match.time)).toBeLessThan(.2);
      await pages[0].waitForTimeout(70);
      attackFixture(room, kind);
      await waitForEffect(pages, kind);
      expect(room.match.events.find(event => event.type === kind).id).toBe(eventId);
      await verifyExpired(pages, kind, eventId, 2);
      expect(fixture.errors, 'Both online browsers have no JavaScript errors').toEqual([]);
    } finally { await fixture.close(); }
  });
}
