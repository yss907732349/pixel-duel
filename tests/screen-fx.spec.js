const {test,expect}=require('@playwright/test');
const path=require('node:path');
const fs=require('node:fs');
const out=path.resolve(__dirname,'../artifacts');
fs.mkdirSync(out,{recursive:true});

test.beforeEach(async({page})=>{
  page.fxErrors=[];page.on('pageerror',e=>page.fxErrors.push(e.message));
  await page.goto('/');await page.bringToFront();
  await page.waitForFunction(()=>window.duel?.screenFX&&document.querySelector('#screen-fx'));
});
test.afterEach(async({page})=>{expect(page.fxErrors,'No browser JavaScript errors').toEqual([]);});
async function begin(page){await page.locator('#start').click();await expect(page.locator('#game-overlay')).toBeHidden();}
async function fixture(page,kind){await page.evaluate(kind=>{
  const m=duel.match;m.reset('duel');
  Object.assign(m.players[0],kind==='blink'?{x:7,y:3,facing:{x:0,y:1}}:{x:6,y:5,facing:{x:-1,y:0}});
  Object.assign(m.players[1],{x:5,y:5,facing:{x:1,y:0}});
  m.players.forEach(p=>{p.drawX=p.x;p.drawY=p.y;});
},kind);}
async function trigger(page,kind){
  await fixture(page,kind);await page.keyboard.press('2');
  await page.waitForFunction(()=>{const a=duel.match.attacks[0];return a&&!a.resolved&&a.impactAt-duel.match.time<.15;});
  await page.keyboard.press(kind==='blink'?'Space':'l');
  await page.waitForFunction(kind=>duel.screenFX.active.some(e=>e.type===kind),kind);
}
async function pixels(page){return page.locator('#screen-fx').evaluate(c=>{
  const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
  let visible=0,dark=0,gold=0;
  for(let i=3;i<data.length;i+=64){if(data[i]>0){visible++;if(data[i-3]+data[i-2]+data[i-1]<180)dark++;if(data[i-3]>150&&data[i-2]>90&&data[i-1]<180)gold++;}}
  const b=c.getBoundingClientRect();return{visible,dark,gold,bounds:{x:b.x,y:b.y,width:b.width,height:b.height},pointerEvents:getComputedStyle(c).pointerEvents};
});}

test('successful parry paints a visible impact and screen shake, then expires within a second',async({page})=>{
  await begin(page);await trigger(page,'parry');
  await expect(page.locator('#screen-fx')).toBeVisible();await expect(page.locator('#screen-fx')).toHaveAttribute('data-active',/parry/);
  await page.waitForTimeout(55);
  const stats=await pixels(page);expect(stats.visible).toBeGreaterThan(0);expect(stats.pointerEvents).toBe('none');
  await expect.poll(()=>page.locator('.shell').evaluate(e=>getComputedStyle(e).transform)).not.toBe('none');
  expect(await page.evaluate(()=>duel.screenFX.active.find(e=>e.type==='parry').duration)).toBeLessThan(1000);
  await page.screenshot({path:path.join(out,'parry-impact.png')});
  await expect(page.locator('#screen-fx')).toBeHidden({timeout:1100});
  await expect.poll(()=>page.locator('.shell').evaluate(e=>getComputedStyle(e).transform)).toBe('none');
});

test('perfect two-cell dodge paints the dark leaf effect while ordinary guard and dodge do not',async({page})=>{
  await begin(page);await page.keyboard.press('l');await page.waitForTimeout(220);
  expect(await page.evaluate(()=>duel.screenFX.active.length)).toBe(0);await expect(page.locator('#screen-fx')).toBeHidden();
  await page.keyboard.press('Space');await page.waitForTimeout(60);
  expect(await page.evaluate(()=>duel.match.players[0].x)).toBe(7);
  expect(await page.evaluate(()=>duel.screenFX.active.length)).toBe(0);
  await trigger(page,'blink');
  expect(await page.evaluate(()=>({x:duel.match.players[0].x,y:duel.match.players[0].y,hp:duel.match.players[1].hp}))).toEqual({x:4,y:5,hp:182});
  await expect(page.locator('#screen-fx')).toHaveAttribute('data-active',/blink/);await page.waitForTimeout(55);
  const stats=await pixels(page);expect(stats.visible).toBeGreaterThan(0);expect(stats.dark).toBeGreaterThan(0);
  await page.screenshot({path:path.join(out,'blink-impact.png')});
  await expect(page.locator('#screen-fx')).toBeHidden({timeout:1100});
});

test('pause and restart clear effects; a reused event id triggers once in a fresh match',async({page})=>{
  await begin(page);await trigger(page,'parry');
  const firstId=await page.evaluate(()=>duel.screenFX.active.find(e=>e.type==='parry').eventId);
  await page.keyboard.press('Escape');await expect(page.locator('#screen-fx')).toBeHidden();
  expect(await page.evaluate(()=>duel.screenFX.active.length)).toBe(0);
  await page.keyboard.press('Enter');await page.waitForTimeout(140);
  await expect(page.locator('#screen-fx')).toBeHidden();
  await page.locator('#restart').click();await expect(page.locator('#screen-fx')).toBeHidden();
  await begin(page);await page.waitForTimeout(100);await expect(page.locator('#screen-fx')).toBeHidden();
  await trigger(page,'parry');
  expect(await page.evaluate(()=>duel.screenFX.active.find(e=>e.type==='parry').eventId)).toBe(firstId);
  await page.locator('#restart').click();await expect(page.locator('#screen-fx')).toBeHidden();
  await begin(page);await page.waitForTimeout(200);await expect(page.locator('#screen-fx')).toBeHidden();
});

test('mobile effect covers the viewport without overflow or intercepting controls',async({page})=>{
  await page.setViewportSize({width:390,height:844});await begin(page);await trigger(page,'blink');
  // Triggering starts at opacity zero; inspect after the pulse's first frames.
  await page.waitForTimeout(55);
  const stats=await pixels(page);expect(stats.visible).toBeGreaterThan(0);expect(stats.pointerEvents).toBe('none');
  expect(stats.bounds.x).toBeGreaterThanOrEqual(-.5);expect(stats.bounds.y).toBeGreaterThanOrEqual(-.5);
  expect(stats.bounds.width).toBeGreaterThanOrEqual(389);expect(stats.bounds.width).toBeLessThanOrEqual(391);
  expect(stats.bounds.height).toBeGreaterThanOrEqual(843);expect(stats.bounds.height).toBeLessThanOrEqual(845);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#pause').click();await expect(page.locator('#game-overlay')).toBeVisible();await expect(page.locator('#screen-fx')).toBeHidden();
});

test('reduced motion keeps the visual impact while disabling shell shake',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.reload();
  await page.waitForFunction(()=>window.duel?.screenFX);await begin(page);await trigger(page,'parry');
  await page.waitForTimeout(55);expect((await pixels(page)).visible).toBeGreaterThan(0);
  expect(await page.locator('.shell').evaluate(e=>getComputedStyle(e).transform)).toBe('none');
  await expect(page.locator('#screen-fx')).toHaveAttribute('data-active',/parry/);
});

test('parried player shows an obvious stun badge and gold HUD until the 600ms control lock ends',async({page})=>{
  async function badgeGold(){return page.evaluate(()=>{
    const p=duel.match.players[1],ctx=duel.renderer.scene.frameTexture.context;
    const x=68+p.x*24+12-20,y=44+p.y*24+12-49;
    const data=ctx.getImageData(x,y,40,12).data;let gold=0;
    for(let i=0;i<data.length;i+=4)if(data[i]>180&&data[i+1]>120&&data[i+2]<190&&data[i]>data[i+1]+10)gold++;
    return gold;
  });}
  await begin(page);await fixture(page,'parry');await page.waitForTimeout(45);
  const idleGold=await badgeGold();await trigger(page,'parry');
  await expect(page.locator('#status-1')).toHaveClass(/is-stunned/);
  await expect(page.locator('#status-1')).toHaveText('眩晕');
  expect(await page.evaluate(()=>duel.match.players[1].state)).toBe('stun');
  expect(await badgeGold()).toBeGreaterThan(idleGold+25);
  // Remove only the presentation layer to show the character's own badge clearly.
  await page.evaluate(()=>duel.screenFX.clear());
  await page.screenshot({path:path.join(out,'stun-state.png')});
  await page.keyboard.press('ArrowUp');
  expect(await page.evaluate(()=>({x:duel.match.players[1].x,y:duel.match.players[1].y}))).toEqual({x:5,y:5});
  await page.waitForFunction(()=>duel.match.time>=duel.match.players[1].stunUntil-.08);
  await page.keyboard.press('ArrowUp');
  expect(await page.evaluate(()=>duel.match.players[1].y)).toBe(5);
  await page.waitForFunction(()=>duel.match.time>=duel.match.players[1].stunUntil+.02);
  await expect(page.locator('#status-1')).not.toHaveClass(/is-stunned/);
  await page.keyboard.press('ArrowUp');
  await expect.poll(()=>page.evaluate(()=>duel.match.players[1].y)).toBe(4);
});
