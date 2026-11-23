const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const out=path.resolve(__dirname,'../artifacts');
fs.mkdirSync(out,{recursive:true});

test.beforeEach(async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.qaErrors=errors;
  await page.goto('/');await page.bringToFront();
  await page.waitForFunction(()=>window.duel&&document.querySelector('#arena canvas'));
});
test.afterEach(async({page})=>{expect(page.qaErrors,'No browser JavaScript errors').toEqual([]);});
async function begin(page){await page.locator('#start').click();await expect(page.locator('#game-overlay')).toBeHidden();}
async function resetFixture(page,fixture){await page.evaluate(f=>{const m=window.duel.match;m.reset('duel');Object.assign(m.players[0],f[0]||{});Object.assign(m.players[1],f[1]||{});for(const p of m.players){p.drawX=p.x;p.drawY=p.y;}},fixture);}

test('boots real canvas and supports both players with actual keydown/up movement',async({page})=>{
  await expect(page.locator('#overlay-title')).toHaveText('剑起，入局。');
  await begin(page);await page.keyboard.press('d');await page.keyboard.press('ArrowLeft');
  await expect.poll(()=>page.evaluate(()=>window.duel.match.players.map(p=>p.x))).toEqual([6,10]);
  await page.waitForTimeout(260);
  await page.keyboard.down('s');await page.keyboard.down('ArrowUp');await page.waitForTimeout(45);
  await page.keyboard.up('s');await page.keyboard.up('ArrowUp');
  await expect.poll(()=>page.evaluate(()=>window.duel.match.players.map(p=>p.y))).toEqual([6,4]);
  await expect(page.locator('#match-state')).toHaveText('交锋中');
  await page.screenshot({path:path.join(out,'game-desktop.png'),fullPage:true});
});

test('Space and player-two dodge key each move exactly two cells, and held walking observes the slower cadence',async({page})=>{
  await begin(page);await resetFixture(page,[{x:5,y:5,facing:{x:1,y:0}},{x:11,y:5,facing:{x:-1,y:0}}]);
  await page.keyboard.press('Space');await page.keyboard.press('0');
  expect(await page.evaluate(()=>duel.match.players.map(p=>({x:p.x,y:p.y})))).toEqual([{x:7,y:5},{x:9,y:5}]);
  expect(await page.evaluate(()=>duel.match.players.every(p=>p.mp<84))).toBe(true);
  await resetFixture(page,[{x:2,y:5,facing:{x:1,y:0}},{x:14,y:5}]);
  await page.evaluate(()=>{const m=duel.match,original=m.act.bind(m);window.walkTimes=[];m.act=(id,action,d)=>{const result=original(id,action,d);if(result&&id===0&&action==='move')walkTimes.push(m.time);return result;};});
  await page.keyboard.down('d');await page.waitForTimeout(560);await page.keyboard.up('d');
  const times=await page.evaluate(()=>walkTimes);expect(times).toHaveLength(3);
  for(let i=1;i<times.length;i++)expect(times[i]-times[i-1]).toBeGreaterThanOrEqual(.22-1e-7);
});

test('keyboard normal attack hits, restores mana and updates the real HUD',async({page})=>{
  await begin(page);await resetFixture(page,[{x:5,y:5,mp:40,facing:{x:1,y:0}},{x:6,y:5,facing:{x:-1,y:0}}]);
  await page.keyboard.press('j');
  await expect.poll(()=>page.evaluate(()=>window.duel.match.players[1].hp)).toEqual(188);
  await expect(page.locator('#hp-label-1')).toHaveText('188 / 200');
  await expect.poll(async()=>Number(await page.locator('#mp-label-0').textContent())).toBeGreaterThanOrEqual(52);
  await expect(page.locator('#events')).toContainText('普攻命中');
});

test('keyboard skill creates the longitudinal warning and double press clears saved stage',async({page})=>{
  await begin(page);await resetFixture(page,[{x:5,y:5,facing:{x:1,y:0}},{x:11,y:5}]);
  await page.keyboard.press('k');
  expect(await page.evaluate(()=>window.duel.match.attacks[0].cells)).toEqual([{x:6,y:5},{x:7,y:5},{x:8,y:5}]);
  expect(await page.evaluate(()=>window.duel.match.players[0].combo)).toBe(1);
  await page.screenshot({path:path.join(out,'game-attack.png')});
  await expect(page.locator('#combo-0')).toContainText('下一式回岚');
  await expect(page.locator('#combo-0 .combo-slots')).toHaveAttribute('data-filled','1');
  await expect.poll(async()=>Number(await page.locator('#mp-label-0').textContent())).toBeLessThan(85);
  await page.waitForTimeout(500);
  const before=await page.evaluate(()=>window.duel.match.players[0].mp);
  await page.keyboard.press('k');await page.waitForTimeout(65);await page.keyboard.press('k');
  await expect.poll(()=>page.evaluate(()=>window.duel.match.players[0].combo)).toBe(0);
  await page.waitForTimeout(280);
  expect(await page.evaluate(()=>window.duel.match.attacks.length)).toBe(0);
  expect(await page.evaluate(()=>window.duel.match.players[0].mp)).toBeGreaterThanOrEqual(before);
  await expect(page.locator('#combo-0')).toHaveText('起手 · 断流');
  await expect(page.locator('#combo-0 .combo-slots')).toHaveAttribute('data-filled','0');
});

test('three combo slots fill through each real skill stage and clear after finisher or stored-stage timeout',async({page})=>{
  const slots0=page.locator('#combo-0 .combo-slots'),slots1=page.locator('#combo-1 .combo-slots');
  await begin(page);await expect(slots0.locator('i')).toHaveCount(3);await expect(slots1.locator('i')).toHaveCount(3);
  await expect(slots0).toHaveAttribute('data-filled','0');await expect(slots1).toHaveAttribute('data-filled','0');
  await page.keyboard.press('k');await page.keyboard.press('2');
  await expect(slots0).toHaveAttribute('data-filled','1');await expect(slots1).toHaveAttribute('data-filled','1');
  await page.waitForFunction(()=>duel.match.time>=duel.match.players[0].cooldowns.skill);
  await page.keyboard.press('k');await expect(slots0).toHaveAttribute('data-filled','2');
  await expect(slots1).toHaveAttribute('data-filled','1');
  const colors=await page.evaluate(()=>[0,1].map(id=>getComputedStyle(document.querySelector(`#combo-${id} .combo-slots i`)).backgroundColor));
  expect(colors[0]).not.toBe(colors[1]);
  const rgb=colors.map(c=>c.match(/[\d.]+/g).map(Number));
  expect(rgb[0][1]).toBeGreaterThan(rgb[0][0]);expect(rgb[1][0]).toBeGreaterThan(rgb[1][1]);
  await page.screenshot({path:path.join(out,'combo-slots.png')});
  await page.waitForFunction(()=>duel.match.time>=duel.match.players[0].cooldowns.skill);
  await page.keyboard.press('k');await expect(slots0).toHaveAttribute('data-filled','3');
  expect(await page.evaluate(()=>duel.match.attacks.some(a=>a.owner===0&&a.stage===3))).toBe(true);
  await expect(slots0).toHaveAttribute('data-filled','0',{timeout:1500});
  expect(await page.evaluate(()=>duel.match.players[0].combo)).toBe(0);
  // Advance the same simulation beyond the stored opponent stage's ten seconds.
  await page.evaluate(()=>duel.match.step(10.1));
  await expect(slots1).toHaveAttribute('data-filled','0');
  await expect(page.locator('#combo-1')).toHaveText('起手 · 断流');
});

test('both players telegraph in distinct cyan and red floor colors',async({page})=>{
  await begin(page);await resetFixture(page,[{x:5,y:5,facing:{x:1,y:0}},{x:11,y:5,facing:{x:-1,y:0}}]);
  await page.keyboard.press('k');await page.keyboard.press('2');
  await page.waitForFunction(()=>duel.match.attacks.length===2&&duel.match.time>.08);
  const colors=await page.evaluate(()=>{
    const c=duel.renderer.scene.frameTexture.context;
    // An interior point away from owner symbols, border corners and hatch lines.
    return [6,10].map(x=>Array.from(c.getImageData(68+x*24+7,44+5*24+7,1,1).data));
  });
  expect(colors[0][2]-colors[0][0]).toBeGreaterThan(15);
  expect(colors[1][0]-colors[1][2]).toBeGreaterThan(15);
  await page.screenshot({path:path.join(out,'dual-telegraphs.png')});
});

test('real keyboard guard parries in range and dodge enters from outside for a back attack',async({page})=>{
  await begin(page);await resetFixture(page,[{x:6,y:5,facing:{x:-1,y:0}},{x:5,y:5,facing:{x:1,y:0}}]);
  await page.keyboard.press('2');
  await page.waitForFunction(()=>{const a=duel.match.attacks[0];return a&&!a.resolved&&a.impactAt-duel.match.time<.15;});
  await page.keyboard.press('l');
  await expect.poll(()=>page.evaluate(()=>window.duel.match.players.map(p=>p.hp))).toEqual([195,184]);
  await expect(page.locator('#events')).toContainText('弹反成功');
  await resetFixture(page,[{x:7,y:3,facing:{x:0,y:1}},{x:5,y:5,facing:{x:1,y:0}}]);
  await page.keyboard.press('2');
  await page.waitForFunction(()=>{const a=duel.match.attacks[0];return a&&!a.resolved&&a.impactAt-duel.match.time<.17;});
  await page.keyboard.press('Space');
  await expect.poll(()=>page.evaluate(()=>({x:duel.match.players[0].x,y:duel.match.players[0].y,hp:duel.match.players[1].hp}))).toEqual({x:4,y:5,hp:182});
  await expect(page.locator('#events')).toContainText('完美闪避');
});

test('knockout displays winner and Enter starts a fresh round',async({page})=>{
  await begin(page);await resetFixture(page,[{x:5,y:5,facing:{x:1,y:0}},{x:6,y:5,hp:12}]);
  await page.keyboard.press('j');await expect(page.locator('#overlay-title')).toHaveText('P1，胜。');
  expect(await page.evaluate(()=>duel.match.winner)).toBe(0);
  await page.keyboard.press('Enter');await expect(page.locator('#game-overlay')).toBeHidden();
  expect(await page.evaluate(()=>duel.match.winner)).toBe(null);
  expect(await page.evaluate(()=>duel.match.players.map(p=>p.hp))).toEqual([200,200]);
});

test('pause and blur freeze time, clear held keys, and require deliberate resume',async({page})=>{
  await begin(page);await page.keyboard.press('Escape');
  await expect(page.locator('#overlay-title')).toHaveText('剑歇，稍候。');
  const pausedTime=await page.evaluate(()=>window.duel.match.time);await page.waitForTimeout(180);
  expect(await page.evaluate(()=>window.duel.match.time)).toBe(pausedTime);
  await page.keyboard.press('Enter');await expect(page.locator('#game-overlay')).toBeHidden();
  await page.keyboard.down('d');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.keyboard.up('d');
  await expect(page.locator('#game-overlay')).toBeVisible();
  const frozen=await page.evaluate(()=>({time:window.duel.match.time,x:window.duel.match.players[0].x}));
  await page.waitForTimeout(180);expect(await page.evaluate(()=>window.duel.match.time)).toBe(frozen.time);
  await page.keyboard.press('Escape');await page.waitForTimeout(180);
  expect(await page.evaluate(()=>window.duel.match.players[0].x)).toBe(frozen.x);
  await expect(page.locator('#game-overlay')).toBeHidden();
});

test('training mode, stationary dummy, sparring AI and restart work through controls',async({page})=>{
  await page.locator('[data-mode="training"]').click();await page.locator('#dummy').check();await begin(page);
  expect(await page.evaluate(()=>window.duel.match.mode)).toBe('training');
  expect(await page.evaluate(()=>window.duel.match.trainingMode)).toBe('dummy');
  await page.waitForTimeout(950);expect(await page.evaluate(()=>window.duel.match.players[1].x)).toBe(11);
  await page.keyboard.press('ArrowLeft');expect(await page.evaluate(()=>window.duel.match.players[1].x)).toBe(11);
  await page.locator('#dummy').uncheck();
  await expect.poll(()=>page.evaluate(()=>window.duel.match.players[1].x),{timeout:3000}).toBeLessThan(11);
  await page.locator('#restart').click();await expect(page.locator('#game-overlay')).toBeVisible();
  expect(await page.evaluate(()=>window.duel.match.players.map(p=>({hp:p.hp,mp:p.mp,x:p.x,y:p.y})))).toEqual([{hp:200,mp:100,x:5,y:5},{hp:200,mp:100,x:11,y:5}]);
  await expect(page.locator('#timer')).toHaveText('03:00');
});

test('rules dialog pauses battle and sound toggle is operable',async({page})=>{
  await begin(page);await page.locator('#rules').click();await expect(page.locator('#rules-dialog')).toBeVisible();
  expect(await page.evaluate(()=>window.duel.match.paused)).toBe(true);
  await page.locator('#rules-dialog .primary').click();await expect(page.locator('#rules-dialog')).not.toBeVisible();
  await page.locator('#sound').click();await expect(page.locator('#sound')).toHaveAttribute('aria-pressed','true');
  await page.locator('#sound').click();await expect(page.locator('#sound')).toHaveAttribute('aria-pressed','false');
});

test('mobile layout stays within screen and touch controls move and attack',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.bringToFront();
  await page.locator('[data-mode="training"]').click();await page.locator('#dummy').check();await begin(page);
  await expect(page.locator('.touch-controls')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('[data-touch="right"]').click();
  await expect.poll(()=>page.evaluate(()=>window.duel.match.players[0].x)).toBe(6);
  await page.waitForTimeout(150);await page.locator('[data-touch="skill"]').click();
  await expect.poll(()=>page.evaluate(()=>window.duel.match.players[0].combo)).toBe(1);
  await page.screenshot({path:path.join(out,'game-mobile.png'),fullPage:true});
  const canvas=await page.locator('#arena canvas').boundingBox();expect(canvas.width).toBeGreaterThan(300);expect(canvas.x).toBeGreaterThanOrEqual(0);expect(canvas.x+canvas.width).toBeLessThanOrEqual(391);
});
