const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const out=path.resolve(__dirname,'../artifacts');
fs.mkdirSync(out,{recursive:true});

test.beforeEach(async({page})=>{
  page.qaErrors=[];
  page.on('pageerror',error=>page.qaErrors.push(error.message));
  await page.goto('/animation-preview.html');
  await page.bringToFront();
  await expect(page.locator('#action option')).not.toHaveCount(0);
});
test.afterEach(async({page})=>{
  expect(page.qaErrors,'Animation preview has no JavaScript errors').toEqual([]);
});
const frameNumber=async page=>Number((await page.locator('#frameCount').textContent()).match(/\d+/)[0]);

test('every action and direction has visible complete frames in its fixed canvas',async({page})=>{
  await page.locator('#next').click();
  const actions=await page.locator('#action option').evaluateAll(options=>options.map(option=>option.value));
  for(const action of actions){
    await page.locator('#action').selectOption(action);
    await expect(page.locator('#actionName')).not.toBeEmpty();
    for(const facing of ['down','left','right','up']){
      await page.locator('#facing').selectOption(facing);
      await expect(page.locator('#preview')).toBeVisible();
      await expect(page.locator('#frameCount')).toContainText('01 /');
    }
  }
  const scan=await page.evaluate(()=>{
    const A=PixelActor,issues=[];let inspected=0;
    for(const action of Object.keys(A.META))for(const facing of ['down','left','right','up'])
      for(let palette=0;palette<2;palette++)for(let frame=0;frame<A.POSES[action].length;frame++){
        const canvas=A.sprite(action,facing,frame,palette),{width:w,height:h}=canvas;
        const pixels=canvas.getContext('2d').getImageData(0,0,w,h).data;
        let visible=0,touchesEdge=false;
        for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(pixels[(y*w+x)*4+3]){
          visible++;
          if(x===0||y===0||x===w-1||y===h-1)touchesEdge=true;
        }
        if(!visible||touchesEdge||w!==A.WIDTH||h!==A.HEIGHT)
          issues.push({action,facing,palette,frame,visible,touchesEdge,w,h});
        inspected++;
      }
    return {inspected,issues};
  });
  expect(scan.inspected).toBeGreaterThan(300);
  expect(scan.issues,'No empty or clipped exported sprite frames').toEqual([]);
  await page.locator('#action').selectOption('skill3');
  const zoomImages=[];
  for(const zoom of ['1','4','6']){
    await page.locator('#zoom').selectOption(zoom);
    zoomImages.push(await page.locator('#preview').evaluate(canvas=>canvas.toDataURL()));
  }
  expect(new Set(zoomImages).size,'Native, 4x and 6x zoom redraw distinctly').toBe(3);
});

test('pause freezes playback, frame steps wrap, and slow playback advances gradually',async({page})=>{
  await page.locator('#action').selectOption('walk');
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveText('播放');
  const frozen=await page.locator('#frameCount').textContent();
  await page.waitForTimeout(250);
  expect(await page.locator('#frameCount').textContent()).toBe(frozen);
  await page.locator('#action').selectOption('idle');
  await page.locator('#action').selectOption('walk');
  const count=await page.evaluate(()=>PixelActor.POSES.walk.length);
  await page.locator('#prev').click();
  expect(await frameNumber(page)).toBe(count);
  await page.locator('#next').click();
  expect(await frameNumber(page)).toBe(1);
  await page.locator('#speed').selectOption('0.1');
  await page.locator('#play').click();
  await page.waitForTimeout(350);
  await page.locator('#play').click();
  expect(await frameNumber(page)).toBeLessThanOrEqual(2);
  await page.locator('#speed').selectOption('1');
  await page.locator('#play').click();
  await expect.poll(()=>frameNumber(page)).toBeGreaterThan(2);
  await page.locator('#play').click();
  await page.locator('#next').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#play')).toHaveText('播放');
});

test('PNG contact sheets and JSON data download with matching dimensions and transparency',async({page})=>{
  await page.locator('#next').click();
  for(const action of ['skill3','death'])for(const palette of ['0','1']){
    await page.locator('#action').selectOption(action);
    await page.locator('#palette').selectOption(palette);
    const pngDownload=page.waitForEvent('download');
    await page.locator('#export').click();
    const png=await pngDownload,pngPath=path.join(out,png.suggestedFilename());
    await png.saveAs(pngPath);
    const bytes=fs.readFileSync(pngPath);
    expect(bytes.subarray(1,4).toString()).toBe('PNG');
    const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
    const jsonDownload=page.waitForEvent('download');
    await page.locator('#export-json').click();
    const json=await jsonDownload,jsonPath=path.join(out,json.suggestedFilename());
    await json.saveAs(jsonPath);
    const data=JSON.parse(fs.readFileSync(jsonPath,'utf8'));
    expect(data.size).toEqual({w:width,h:height});
    expect(data.facings).toEqual(['down','left','right','up']);
    expect(Object.keys(data.frames).length).toBe(width/data.frameSize.w*4);
    for(const frame of Object.values(data.frames)){
      expect(frame.anchor).toEqual(data.anchor);
      expect(frame.duration).toBeGreaterThan(0);
      expect(frame.frame.x+frame.frame.w).toBeLessThanOrEqual(width);
      expect(frame.frame.y+frame.frame.h).toBeLessThanOrEqual(height);
    }
    const alpha=await page.evaluate(async source=>{
      const image=await createImageBitmap(await(await fetch(source)).blob());
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
      const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let transparent=0,visible=0;
      for(let i=3;i<rgba.length;i+=4){if(rgba[i]===0)transparent++;else visible++;}
      return {transparent,visible};
    },'data:image/png;base64,'+bytes.toString('base64'));
    expect(alpha.transparent).toBeGreaterThan(alpha.visible);
    expect(alpha.visible).toBeGreaterThan(1000);
  }
  await page.locator('#action').selectOption('skill3');
  await page.locator('#facing').selectOption('right');
  for(let i=0;i<5;i++)await page.locator('#next').click();
  await page.screenshot({path:path.join(out,'animation-workshop.png'),fullPage:true});
});

test('mobile workshop contains preview and scrollable contact sheet without page overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.locator('#action').selectOption('skill3');
  await page.locator('#next').click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const preview=await page.locator('#preview').boundingBox();
  expect(preview.x).toBeGreaterThanOrEqual(0);
  expect(preview.x+preview.width).toBeLessThanOrEqual(390);
  await expect(page.locator('#export')).toBeVisible();
  await expect(page.locator('#export-json')).toBeVisible();
  await page.screenshot({path:path.join(out,'animation-mobile.png'),fullPage:true});
});
