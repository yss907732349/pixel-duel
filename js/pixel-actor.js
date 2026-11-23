/* Authored pixel poses; no imported art, fonts, rotated rectangles, or image API. */
(function (global) {
  'use strict';
  // A 32×40 body sits inside a common 64×64 envelope. The extra transparent
  // margin accommodates full sword arcs, scarf lag, and falling poses.
  const WIDTH = 64, HEIGHT = 64, ANCHOR = { x: 32, y: 48 };
  const PALETTES = [
    { name: '青岚', outline: '#142b35', cloth0: '#1c434e', cloth1: '#286878', cloth2: '#3e9caa', cloth3: '#78e1d6', armor0: '#344c60', armor1: '#647f8b', armor2: '#a2bfc2', armor3: '#dbe7d6', hair0: '#233847', hair1: '#3b5262', hair2: '#607889', hair3: '#8b9fa8', skin0: '#9c746a', skin1: '#cc9d84', skin2: '#edc5a1', skin3: '#ffdfb4', gold0: '#8a7759', gold1: '#c5ad76', gold2: '#f1d99d' },
    { name: '赤烬', outline: '#342b39', cloth0: '#623444', cloth1: '#98505b', cloth2: '#c76f70', cloth3: '#ffa188', armor0: '#4c4355', armor1: '#827180', armor2: '#baa1a5', armor3: '#efdbcb', hair0: '#362e3b', hair1: '#51414b', hair2: '#806469', hair3: '#ac8980', skin0: '#9c746a', skin1: '#cc9d84', skin2: '#edc5a1', skin3: '#ffdfb4', gold0: '#8a7759', gold1: '#c5ad76', gold2: '#f1d99d' }
  ];
  // [bob, lean, front-foot x, front-foot y, back-foot x, back-foot y,
  //  sword angle in eighth-turns, hand reach, cape lag, off-hand height, smear]
  // Angles are relative to facing: 0 thrust, negative backswing, positive follow-through.
  const POSES = {
    idle: [[0,0,0,0,0,0,-1,0,0,0,0],[0,0,0,0,0,0,-1,0,1,0,0],[-1,0,0,0,0,0,-1,0,1,-1,0],[0,0,0,0,0,0,-1,0,0,0,0]],
    walk: [[0,1,2,-1,-2,1,-1,0,-2,-1,0],[-1,1,2,-2,-2,2,-1,0,-1,-2,0],[0,1,1,-1,-1,1,-1,1,0,-1,0],[1,0,0,0,0,0,-1,0,1,0,0],[0,1,-2,1,2,-1,-1,-1,2,1,0],[-1,1,-2,2,2,-2,-1,-1,1,2,0],[0,1,-1,1,1,-1,-1,0,0,1,0],[1,0,0,0,0,0,-1,0,-1,0,0]],
    basic: [[0,-1,0,0,0,0,-2,-1,0,-1,0],[-1,-2,-1,0,1,0,-3,-2,1,-2,0],[-1,-2,-1,0,1,0,-3,-2,2,-2,0],[0,2,2,0,-1,0,-1,2,-3,0,1],[1,3,3,0,-1,0,0,3,-4,1,2],[1,2,2,0,-1,0,1,2,-3,1,1],[0,1,1,0,0,0,1,1,-1,0,0],[0,0,0,0,0,0,-1,0,0,0,0]],
    skill1: [[0,-1,-1,0,1,0,-1,-1,1,-1,0],[-1,-2,-2,0,1,0,-1,-2,2,-2,0],[-1,-2,-2,0,1,0,0,-2,2,-2,0],[-1,-2,-2,0,1,0,0,-2,2,-2,0],[0,3,3,-1,-1,0,0,4,-4,0,2],[1,3,3,-1,-1,0,0,4,-4,0,3],[1,2,2,0,0,0,0,3,-3,0,1],[0,1,1,0,0,0,-1,1,-1,0,0],[0,0,0,0,0,0,-1,0,0,0,0]],
    skill2: [[0,-1,0,0,0,0,2,-1,1,1,0],[-1,-2,-1,0,1,0,3,-1,2,2,0],[-1,-2,-2,0,1,0,3,-1,3,2,0],[0,1,1,0,-1,0,1,2,-1,0,1],[1,3,3,0,-2,0,-1,3,-4,-1,3],[1,2,2,0,-2,0,-2,2,-3,-1,2],[0,1,1,0,-1,0,-2,1,-2,0,1],[0,0,0,0,0,0,-1,0,-1,0,0],[0,0,0,0,0,0,-1,0,0,0,0]],
    skill3: [[0,-1,-1,0,1,0,-2,-1,1,-1,0],[-1,-2,-2,0,1,0,-3,-2,2,-2,0],[-2,-2,-2,0,1,0,-3,-2,3,-2,0],[-2,-1,-1,0,1,0,-3,-1,3,-2,0],[-1,1,1,-1,-1,0,-2,2,-1,-1,1],[1,3,3,0,-2,1,0,4,-4,0,3],[2,3,3,0,-2,1,2,3,-4,1,3],[1,2,2,0,-1,0,3,1,-3,1,2],[1,1,1,0,0,0,2,0,-2,1,0],[0,0,0,0,0,0,0,0,-1,0,0],[0,0,0,0,0,0,-1,0,0,0,0]],
    block: [[0,-1,0,0,0,0,-2,-1,0,-2,0],[1,-1,-1,0,1,0,-2,-1,1,-3,0],[1,-1,-1,0,1,0,-2,-1,2,-3,0],[0,0,0,0,0,0,-1,0,1,-1,0]],
    dodge: [[1,1,1,0,-1,0,1,0,0,1,0],[3,3,3,-2,-3,1,1,-1,-3,3,0],[4,4,3,-2,-3,2,1,-2,-4,4,0],[3,4,3,-2,-3,2,1,-1,-4,3,0],[2,2,2,-1,-2,1,0,0,-3,2,0],[0,0,0,0,0,0,-1,0,-1,0,0]],
    hurt: [[0,-2,-1,0,1,0,1,-1,2,1,0],[1,-3,-2,1,2,0,2,-2,3,2,0],[0,-1,-1,0,1,0,0,-1,2,1,0]],
    stun: [[1,-1,0,0,0,0,1,-1,0,2,0],[1,0,0,0,0,0,1,-1,1,2,0],[2,1,0,0,0,0,1,-1,0,3,0],[1,0,0,0,0,0,1,-1,-1,2,0]],
    death: [[0,-2,-1,0,1,0,1,-1,1,1,0],[2,-3,-2,0,2,0,2,-2,2,3,0],[5,-4,-3,1,2,0,2,-2,3,4,0],[8,-4,-3,2,3,0,2,-2,3,5,0],[11,-3,-3,2,3,1,2,-2,3,5,0],[12,-2,-3,2,3,1,2,-2,3,5,0]]
  };
  const META = {
    idle: { label:'待机 · 呼吸与披风', fps:4, loop:true }, walk:{label:'移动 · 八帧重心转移',fps:12,loop:true},
    basic:{label:'普攻 · 斩击',fps:18,loop:false},skill1:{label:'一式 · 穿风刺',fps:18,loop:false},skill2:{label:'二式 · 回身横斩',fps:18,loop:false},skill3:{label:'三式 · 蓄力破阵',fps:18,loop:false},
    block:{label:'格挡 · 抬手架势',fps:20,loop:false},dodge:{label:'闪避 · 俯身残影',fps:28,loop:false},hurt:{label:'受击 · 冲击后仰',fps:20,loop:false},stun:{label:'眩晕 · 失衡',fps:10,loop:true},death:{label:'倒地 · 重心坠落',fps:12,loop:false}
  };
  const cache = new Map(), states = new WeakMap();
  const VECTORS = [[1,0],[.707,.707],[0,1],[-.707,.707],[-1,0],[-.707,-.707],[0,-1],[.707,-.707]];
  function R(c, col, x, y, w, h) { c.fillStyle=col; c.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h))); }
  function L(c,col,x0,y0,x1,y1,width=1) {
    x0=Math.round(x0); y0=Math.round(y0); x1=Math.round(x1); y1=Math.round(y1);
    const dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1; let err=dx+dy;
    for (let safety=0;safety<150;safety++) { R(c,col,x0-Math.floor(width/2),y0-Math.floor(width/2),width,width); if(x0===x1&&y0===y1) break; const e=err*2;if(e>=dy){err+=dy;x0+=sx;}if(e<=dx){err+=dx;y0+=sy;} }
  }
  function P(c,col,points) {
    const ys=points.map(p=>p[1]),min=Math.floor(Math.min(...ys)),max=Math.ceil(Math.max(...ys));
    for(let y=min;y<=max;y++) {
      const intersections=[];
      for(let i=0,j=points.length-1;i<points.length;j=i++) {const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)) intersections.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}
      intersections.sort((a,b)=>a-b); for(let i=0;i<intersections.length;i+=2) R(c,col,Math.ceil(intersections[i]),y,Math.floor(intersections[i+1])-Math.ceil(intersections[i])+1,1);
    }
  }
  function blade(c,pal,hx,hy,angle,smear) {
    const dir=VECTORS[(Math.round(angle)%8+8)%8],perp=[-dir[1],dir[0]],len=11;
    if(smear) {
      c.globalAlpha=.16+smear*.05;
      for(let i=1;i<=smear;i++) {const v=VECTORS[(Math.round(angle)-i+16)%8];L(c,pal.cloth3,hx+v[0]*4,hy+v[1]*4,hx+v[0]*13,hy+v[1]*13,3-i%2);}
      c.globalAlpha=1;
    }
    L(c,pal.outline,hx,hy,hx+dir[0]*len,hy+dir[1]*len,4);
    L(c,pal.armor1,hx+dir[0]*2,hy+dir[1]*2,hx+dir[0]*len,hy+dir[1]*len,2);
    L(c,pal.armor3,hx+dir[0]*3-perp[0],hy+dir[1]*3-perp[1],hx+dir[0]*(len-1)-perp[0],hy+dir[1]*(len-1)-perp[1],1);
    L(c,pal.outline,hx-perp[0]*3,hy-perp[1]*3,hx+perp[0]*3,hy+perp[1]*3,3);
    L(c,pal.gold1,hx-perp[0]*3,hy-perp[1]*3,hx+perp[0]*3,hy+perp[1]*3,1);
    L(c,pal.gold0,hx-dir[0]*3,hy-dir[1]*3,hx-dir[0],hy-dir[1],2);
    if(smear>1) {R(c,'#fff6ce',hx+dir[0]*11,hy+dir[1]*11,2,1);R(c,'#fff6ce',hx+dir[0]*11,hy+dir[1]*11-1,1,3);}
  }
  function arm(c,pal,sx,sy,ex,ey,hx,hy,front) {
    L(c,pal.outline,sx,sy,ex,ey,5);L(c,pal.outline,ex,ey,hx,hy,4);
    L(c,front?pal.armor1:pal.armor0,sx,sy,ex,ey,3);L(c,pal.cloth1,ex,ey,hx,hy,2);
    R(c,pal.armor2,sx-1,sy-1,3,2); R(c,pal.skin0,hx-1,hy-1,3,3);R(c,pal.skin2,hx,hy-1,2,2);
  }
  // Three independently authored support/landing/rest silhouettes. No standing
  // image is squashed, rotated, or resampled to create a fallen body.
  function paintFallen(c,pal,facing,frame) {
    const up=facing==='up',down=facing==='down',side=!up&&!down,rest=frame===5;
    if(frame===3) {
      // Collapse: one knee folds underneath the hip; the forward hand braces.
      const hx=side?22:16,hy=up?18:24;
      P(c,pal.outline,[[9,25],[19,24],[24,31],[22,37],[14,39],[8,35]]);
      P(c,pal.cloth0,[[10,26],[18,25],[22,31],[20,36],[13,37],[9,34]]);
      P(c,pal.cloth1,[[11,27],[16,27],[18,34],[13,36],[10,34]]);
      L(c,pal.cloth2,11,28,12,34);
      L(c,pal.outline,17,31,22,35,5);L(c,pal.armor0,17,31,22,35,3);
      L(c,pal.outline,22,35,17,38,4);L(c,pal.armor1,22,35,17,38,2);
      R(c,pal.outline,13,37,7,3);R(c,pal.armor2,14,37,4,1);
      L(c,pal.outline,14,31,10,34,5);L(c,pal.armor0,14,31,10,34,3);
      R(c,pal.outline,7,33,5,3);R(c,pal.armor1,8,33,3,1);
      P(c,pal.outline,[[13,24],[21,25],[24,31],[17,34],[12,29]]);
      P(c,up?pal.cloth1:pal.armor0,[[14,25],[20,26],[22,30],[17,32],[13,29]]);
      if(up){L(c,pal.cloth2,14,26,16,31);R(c,pal.cloth0,18,29,2,3);}
      else{P(c,pal.armor1,[[15,25],[20,27],[21,29],[16,30],[14,28]]);R(c,pal.armor2,15,26,3,2);}
      L(c,pal.gold0,14,31,21,32,2);R(c,pal.gold2,17,31,2,2);
      const handY=down?31:35;
      arm(c,pal,20,27,25,30,27,handY,true);
      blade(c,pal,26,handY,side?1:up?6:2,0);
      R(c,pal.outline,hx-5,hy-5,10,12);R(c,pal.skin1,hx-4,hy-3,8,9);R(c,pal.skin2,hx-3,hy-2,6,7);
      R(c,pal.hair0,hx-5,hy-5,10,5);R(c,pal.hair1,hx-4,hy-5,8,3);R(c,pal.hair2,hx-3,hy-5,5,1);
      R(c,pal.cloth3,hx-5,hy-1,10,2);
      if(up){R(c,pal.hair0,hx-4,hy+1,8,6);R(c,pal.hair1,hx-3,hy+1,5,4);}
      else{R(c,pal.hair0,hx-5,hy,3,5);R(c,pal.outline,hx+1,hy+3,3,1);R(c,pal.skin0,hx+2,hy+5,2,1);}
      L(c,pal.cloth1,hx-5,hy,hx-8,hy+6,2);
      return;
    }
    if(side) {
      // Landing/rest: a lateral torso, separately folded legs, and a side-lying
      // head. Rest shifts the support hand and settles the mantle by one pixel.
      const sy=rest?1:0;
      P(c,pal.outline,[[10,29+sy],[23,29+sy],[28,34+sy],[23,39],[11,39],[6,35]]);
      P(c,pal.cloth0,[[11,30+sy],[22,30+sy],[25,34+sy],[22,37],[11,37],[8,35]]);
      P(c,pal.cloth1,[[11,31+sy],[19,31+sy],[22,35],[13,36],[9,34]]);
      L(c,pal.cloth2,11,32+sy,18,33+sy);L(c,pal.cloth0,12,36,20,37);
      L(c,pal.outline,16,34,10,38,5);L(c,pal.armor0,16,34,10,38,3);
      L(c,pal.outline,10,38,5,36,4);L(c,pal.armor1,10,38,5,36,2);R(c,pal.armor2,5,35,3,1);
      L(c,pal.outline,17,33,10,33,5);L(c,pal.armor0,17,33,10,33,3);L(c,pal.outline,10,33,5,32,4);L(c,pal.armor1,10,33,5,32,2);
      P(c,pal.outline,[[16,29+sy],[24,30+sy],[25,35+sy],[17,37],[13,34]]);
      P(c,pal.armor0,[[17,30+sy],[23,31+sy],[23,34+sy],[17,35],[15,33]]);
      L(c,pal.armor1,17,31+sy,22,32+sy,3);L(c,pal.armor2,17,30+sy,21,31+sy);
      L(c,pal.gold0,15,31,14,35,2);R(c,pal.gold2,14,33,2,2);
      arm(c,pal,23,32+sy,rest?24:28,36,rest?28:30,rest?38:35,true);
      // The released sword rests beside the front hand instead of shrinking.
      blade(c,pal,rest?27:29,rest?39:36,0,0);
      const hx=rest?27:26,hy=rest?32:30;
      P(c,pal.outline,[[hx-4,hy-5],[hx+3,hy-4],[hx+5,hy],[hx+3,hy+5],[hx-3,hy+5],[hx-6,hy+1]]);
      P(c,pal.skin1,[[hx-3,hy-3],[hx+2,hy-2],[hx+3,hy+1],[hx+1,hy+4],[hx-3,hy+3],[hx-4,hy]]);
      R(c,pal.skin2,hx-2,hy-1,4,3);R(c,pal.skin0,hx+1,hy+3,2,1);
      P(c,pal.hair0,[[hx-4,hy-5],[hx+3,hy-4],[hx+4,hy-1],[hx,hy],[hx-2,hy+4],[hx-5,hy+1]]);
      L(c,pal.hair1,hx-3,hy-4,hx+2,hy-3,2);L(c,pal.hair2,hx-2,hy-4,hx+1,hy-3);
      L(c,pal.cloth3,hx-3,hy-1,hx+3,hy,2);L(c,pal.outline,hx+1,hy+2,hx+3,hy+2);
      L(c,pal.cloth1,hx-4,hy,hx-8,hy+3,2);R(c,pal.cloth2,hx-8,hy+3,3,1);
      return;
    }
    // Forward/backward falls share limbs but have separately layered mantle,
    // shoulders, face, headband, and weapon placement.
    const hy=up?(rest?25:23):(rest?37:35),torsoY=up?31:29,sy=rest?1:0;
    P(c,pal.outline,[[9,torsoY-4],[22,torsoY-4],[25,torsoY+4],[21,torsoY+9],[10,torsoY+8],[7,torsoY+2]]);
    P(c,pal.cloth0,[[10,torsoY-3],[21,torsoY-3],[23,torsoY+3],[20,torsoY+7],[11,torsoY+6],[9,torsoY+2]]);
    P(c,pal.cloth1,[[11,torsoY-2],[16,torsoY-2],[19,torsoY+5],[12,torsoY+5],[10,torsoY+1]]);
    L(c,pal.cloth2,11,torsoY-1,13,torsoY+4);
    const legY=up?39:25;
    L(c,pal.outline,13,legY,8,legY+2,5);L(c,pal.armor0,13,legY,8,legY+2,3);R(c,pal.armor1,6,legY+2,5,2);R(c,pal.armor2,7,legY+2,3,1);
    L(c,pal.outline,20,legY,24,legY-1,5);L(c,pal.armor0,20,legY,24,legY-1,3);R(c,pal.armor1,23,legY-2,5,2);R(c,pal.armor2,24,legY-2,3,1);
    if(!up){R(c,pal.armor0,11,torsoY-2,11,7);R(c,pal.armor1,12,torsoY-2,9,4);R(c,pal.armor2,12,torsoY-2,4,2);L(c,pal.gold1,11,torsoY-3,22,torsoY-3,2);}
    else {L(c,pal.cloth0,17,torsoY-1,18,torsoY+5,2);R(c,pal.armor1,10,torsoY-3,13,2);}
    arm(c,pal,11,torsoY,7,torsoY+3,rest?8:5,torsoY+5,false);
    arm(c,pal,22,torsoY,27,torsoY+1,rest?25:29,torsoY+4,true);
    blade(c,pal,rest?26:29,torsoY+5,up?7:1,0);
    const hx=16+(rest?1:0);
    P(c,pal.outline,[[hx-5,hy-4],[hx+3,hy-5],[hx+6,hy-1],[hx+4,hy+5],[hx-3,hy+5],[hx-6,hy+1]]);
    R(c,pal.skin1,hx-4,hy-3,8,7);R(c,pal.skin2,hx-3,hy-2,6,5);
    P(c,pal.hair0,[[hx-5,hy-4],[hx+3,hy-5],[hx+5,hy-2],[hx+3,hy],[hx-4,hy+1]]);
    L(c,pal.hair1,hx-3,hy-4,hx+2,hy-4,2);R(c,pal.hair2,hx-2,hy-4,3,1);
    L(c,pal.cloth3,hx-5,hy-1,hx+4,hy-2,2);
    if(up){R(c,pal.hair0,hx-4,hy,8,5);R(c,pal.hair1,hx-3,hy,6,3);R(c,pal.hair2,hx-2,hy,3,1);}
    else {L(c,pal.outline,hx-3,hy+2,hx-1,hy+2);L(c,pal.outline,hx+2,hy+1,hx+4,hy+1);R(c,pal.skin0,hx,hy+4,2,1);}
    L(c,pal.cloth1,hx-5,hy,hx-8,hy+3+sy,2);
  }
  function paintSprite(c, action, facing, frame, pal) {
    c.clearRect(0,0,WIDTH,HEIGHT);c.imageSmoothingEnabled=false;
    c.save();c.translate(16,16);
    if(action==='death'&&frame>=3){paintFallen(c,pal,facing,frame);c.restore();return;}
    const v=POSES[action][Math.min(frame,POSES[action].length-1)], [bob,lean,fx,fy,bx,by,angle,reach,cape,offy,smear]=v;
    const side=facing==='right'||facing==='left', up=facing==='up', down=facing==='down';
    const fdir=side?0:up?6:2;
    const cx=16+lean, cy=21+bob;
    const footL=side?{x:12+bx,y:32+by}:{x:12+bx*.5,y:32+by};
    const footR=side?{x:20+fx,y:32+fy}:{x:20+fx*.5,y:32+fy};
    // Back-leg → cloak → torso → front-leg separation preserves readable gait.
    L(c,pal.outline,cx-2,cy+5,footL.x,footL.y,5);L(c,pal.armor0,cx-2,cy+5,footL.x,footL.y-1,3);
    R(c,pal.outline,footL.x-2,footL.y,6,3);R(c,pal.armor1,footL.x-1,footL.y,3,2);
    const hem=30+bob;
    P(c,pal.outline,[[cx-6,cy-3],[cx+5,cy-3],[cx+7+cape*.5,hem],[cx+2,hem+2],[cx-2,hem],[cx-7+cape,hem+1]]);
    P(c,pal.cloth0,[[cx-5,cy-2],[cx+4,cy-2],[cx+5+cape*.5,hem-1],[cx+1,hem],[cx-3,hem-1],[cx-6+cape,hem]]);
    P(c,pal.cloth1,[[cx-4,cy-1],[cx-1,cy],[cx-1+cape*.6,hem-2],[cx-5+cape,hem-1]]);
    L(c,pal.cloth2,cx-5,cy,cx-4+cape*.6,hem-2);
    const backHand=side?{x:cx-5,y:cy+3+offy}:{x:cx-6,y:cy+3+offy};
    arm(c,pal,cx-4,cy-1,cx-6,cy+1,backHand.x,backHand.y,false);
    R(c,pal.outline,cx-5,cy-3,11,13);R(c,pal.cloth1,cx-4,cy-2,9,10);
    R(c,pal.armor0,cx-4,cy-2,9,7);R(c,pal.armor1,cx-3,cy-2,7,5);
    R(c,pal.armor2,cx-3,cy-2,3,4);R(c,pal.armor3,cx-3,cy-2,2,1);
    R(c,pal.armor0,cx+1,cy,2,4);R(c,pal.armor2,cx-1,cy+1,2,2);
    R(c,pal.outline,cx-6,cy-4,5,5);R(c,pal.armor1,cx-5,cy-4,4,3);R(c,pal.armor2,cx-5,cy-4,3,1);
    R(c,pal.outline,cx+3,cy-3,5,4);R(c,pal.armor1,cx+3,cy-3,4,3);R(c,pal.armor2,cx+3,cy-3,3,1);
    R(c,pal.cloth3,cx-5,cy-2,1,4);R(c,pal.cloth2,cx+4,cy-1,1,4);
    R(c,pal.outline,cx-5,cy+5,11,3);R(c,pal.gold0,cx-5,cy+5,11,2);R(c,pal.gold1,cx-4,cy+5,9,1);R(c,pal.gold2,cx-1,cy+5,3,2);
    L(c,pal.outline,cx+2,cy+7,footR.x,footR.y,5);L(c,pal.armor0,cx+2,cy+7,footR.x,footR.y-1,3);R(c,pal.armor2,footR.x-1,footR.y-3,3,2);
    R(c,pal.outline,footR.x-2,footR.y,6,3);R(c,pal.armor1,footR.x-1,footR.y,4,2);R(c,pal.armor2,footR.x,footR.y,3,1);
    if(up) {
      // Facing away: mantle, back seam and layered cape replace the breastplate.
      P(c,pal.cloth0,[[cx-5,cy-3],[cx+5,cy-3],[cx+6+cape*.5,hem],[cx+1,hem+1],[cx-5+cape,hem]]);
      P(c,pal.cloth1,[[cx-4,cy-2],[cx+1,cy-1],[cx+2+cape*.5,hem-1],[cx-4+cape*.8,hem-1]]);
      L(c,pal.cloth2,cx-3,cy-1,cx-3+cape*.5,hem-2);L(c,pal.cloth0,cx+1,cy,cx+2+cape*.6,hem-2);
      R(c,pal.armor2,cx-5,cy-3,10,2); R(c,pal.gold1,cx-1,cy-1,2,2);
    }
    let hx=side?cx+5+reach:cx+5+(reach*.4),hy=side?cy+2+offy*.4:cy+(up?-3:5)+reach;
    hx=Math.max(6,Math.min(25,hx));hy=Math.max(14,Math.min(29,hy));
    if(up) blade(c,pal,hx,hy,fdir+angle,smear);
    // Neck, face planes and individually authored front/back hair silhouettes.
    const headX=cx+(side?1:0), headY=cy-10;
    R(c,pal.outline,headX-5,headY-5,10,12);R(c,pal.skin0,headX-3,headY+3,6,4);
    R(c,pal.skin1,headX-4,headY-2,8,8);R(c,pal.skin2,headX-3,headY-2,7,6);R(c,pal.skin3,headX,headY-1,3,2);
    R(c,pal.hair0,headX-5,headY-5,10,5);R(c,pal.hair1,headX-4,headY-5,8,3);R(c,pal.hair2,headX-3,headY-5,6,1);R(c,pal.hair3,headX-2,headY-5,2,1);
    R(c,pal.hair0,headX-5,headY-2,3,7);R(c,pal.hair1,headX-4,headY-2,2,5);
    R(c,pal.cloth3,headX-5,headY-1,10,2);R(c,pal.cloth2,headX-5,headY,3,1);
    if(up) {
      R(c,pal.hair0,headX-4,headY+1,8,6);R(c,pal.hair1,headX-3,headY+1,6,4);R(c,pal.hair2,headX-2,headY+1,3,2);
      R(c,pal.cloth0,headX-2,headY+5,5,3);R(c,pal.cloth2,headX,headY+6,1,3);
    } else if(down) {
      R(c,pal.outline,headX-3,headY+2,2,1);R(c,pal.outline,headX+2,headY+2,2,1);R(c,pal.skin0,headX,headY+4,1,1);R(c,pal.skin1,headX-1,headY+5,3,1);
      R(c,pal.hair0,headX+3,headY,2,4);R(c,pal.hair1,headX+3,headY+1,1,2);
    } else {
      R(c,pal.outline,headX+1,headY+2,3,1);R(c,pal.skin3,headX+4,headY+2,1,2);R(c,pal.skin0,headX+2,headY+5,2,1);
      R(c,pal.hair0,headX-5,headY+1,3,5);R(c,pal.hair2,headX-4,headY+1,1,3);
    }
    // A scarf's delayed hem uses independent frames rather than a breathing scale.
    const scarfX=headX-5,scarfY=headY+1;
    L(c,pal.outline,scarfX,scarfY,scarfX-4+cape,scarfY+3,3);L(c,pal.cloth2,scarfX,scarfY,scarfX-4+cape,scarfY+3,1);
    if(!up) {arm(c,pal,cx+5,cy-2,cx+6,cy,hx,hy,true);blade(c,pal,hx,hy,fdir+angle,smear);}
    else arm(c,pal,cx+5,cy-2,cx+6,cy-1,hx,hy,true);
    if(action==='block') {
      const sx=side?cx+9:cx+1, sy=side?cy+1:cy+(up?-4:7);
      P(c,pal.outline,[[sx-4,sy-6],[sx+2,sy-8],[sx+5,sy-4],[sx+4,sy+4],[sx,sy+8],[sx-5,sy+3]]);
      P(c,pal.armor1,[[sx-3,sy-5],[sx+2,sy-6],[sx+3,sy-3],[sx+2,sy+3],[sx,sy+5],[sx-3,sy+2]]);
      P(c,pal.cloth1,[[sx-2,sy-4],[sx+1,sy-5],[sx+2,sy-2],[sx+1,sy+2],[sx,sy+4],[sx-2,sy+1]]);
      L(c,pal.cloth3,sx,sy-4,sx,sy+3);R(c,pal.gold2,sx-1,sy-1,3,2);
      if(frame===2) {R(c,'#fff5c4',sx+3,sy-5,1,3);R(c,'#fff5c4',sx+2,sy-4,3,1);}
    }
    if(action==='hurt'&&frame===0) {
      c.globalCompositeOperation='source-atop';c.globalAlpha=.65;R(c,'#fff2d5',-16,-16,WIDTH,HEIGHT);c.globalAlpha=1;c.globalCompositeOperation='source-over';
    }
    c.restore();
  }
  function sprite(action, facing, frame=0, palette=0) {
    if(!POSES[action]) action='idle';if(!['up','down','left','right'].includes(facing))facing='right';
    frame=Math.max(0,Math.min(POSES[action].length-1,Math.floor(frame)));palette=palette%PALETTES.length;
    const key=[action,facing,frame,palette].join(':');if(cache.has(key))return cache.get(key);
    const c=document.createElement('canvas');c.width=WIDTH;c.height=HEIGHT;const ctx=c.getContext('2d');
    paintSprite(ctx,action,facing,frame,PALETTES[palette]);
    if(facing==='left') {
      const image=ctx.getImageData(0,0,WIDTH,HEIGHT), copy=new Uint8ClampedArray(image.data);
      for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++)for(let k=0;k<4;k++)image.data[(y*WIDTH+x)*4+k]=copy[(y*WIDTH+WIDTH-1-x)*4+k];ctx.putImageData(image,0,0);
    }
    cache.set(key,c);return c;
  }
  function direction(p) {return p.facing?.y<0?'up':p.facing?.y>0?'down':p.facing?.x<0?'left':'right';}
  function frameIndex(action,time) {const meta=META[action],count=POSES[action].length,n=Math.max(0,Math.floor(time*meta.fps));return meta.loop?n%count:Math.min(count-1,n);}
  function draw(ctx,p,pos,time,attacks=[]) {
    let action=p.hp<=0?'death':p.state==='move'?'walk':p.state==='dead'?'death':p.state||'idle';
    const attack=attacks.find(a=>a.owner===p.id&&time>=a.startsAt&&time<=a.endsAt);
    if(attack)action=attack.kind==='skill'?'skill'+Math.max(1,Math.min(3,attack.stage||1)):'basic';
    if(p.state==='hurt'||p.state==='stun'||p.state==='block'||p.state==='dodge'||p.hp<=0)action=p.hp<=0?'death':p.state;
    if(!POSES[action])action='idle';
    let s=states.get(p);if(!s||s.action!==action){s={action,at:time,lastX:pos.x,lastY:pos.y};states.set(p,s);}
    let f=frameIndex(action,time-s.at);
    if(attack&&/^skill|basic/.test(action)) {
      const before=time<=attack.impactAt;
      const windup=(attack.impactAt-attack.startsAt)||.3;
      const impactFrame=action==='skill3'?5:action==='skill2'?4:action==='basic'?4:4;
      f=before?Math.min(impactFrame-1,Math.floor(((time-attack.startsAt)/windup)*impactFrame)):Math.min(POSES[action].length-1,impactFrame+Math.floor((time-attack.impactAt)/Math.max(.02,(attack.endsAt-attack.impactAt)/(POSES[action].length-impactFrame))));
    }
    const facing=direction(p),palette=(typeof p.id==='number'?p.id:0)%2, color=PALETTES[palette].cloth3;
    const x=Math.round(pos.x-ANCHOR.x),y=Math.round(pos.y-ANCHOR.y+5);
    // All afterimages share the same foot anchor; no scale or baseline drift.
    if(action==='dodge') {
      const dx=p.facing?.x||0,dy=p.facing?.y||0;
      for(let i=3;i>=1;i--){ctx.globalAlpha=.07+(3-i)*.055;ctx.drawImage(sprite(action,facing,Math.max(0,f-i),palette),x-dx*i*8,y-dy*i*8);}
      ctx.globalAlpha=1;
    }
    ctx.drawImage(sprite(action,facing,f,palette),x,y);
    if(action!=='death') {
      R(ctx,color,pos.x-6,pos.y+10,12,1);
      if(action!=='stun') {
        ctx.font='5px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(p.id===0?'P1':'P2',Math.round(pos.x),Math.round(pos.y-31));
      }
    }
    if(action==='stun') {
      // A fixed label and a draining bar make the entire control-loss period
      // readable; orbiting stars remain separate from the anchored body poses.
      const cx=Math.round(pos.x),hy=Math.round(pos.y-29),badgeY=Math.round(pos.y-49);
      ctx.save();ctx.globalAlpha=1;
      R(ctx,'#1a202c',cx-20,badgeY,40,12);
      R(ctx,'#d9b86e',cx-19,badgeY,38,1);
      R(ctx,'#d9b86e',cx-20,badgeY+1,1,10);R(ctx,'#d9b86e',cx+19,badgeY+1,1,10);
      R(ctx,color,cx-19,badgeY+11,38,1);
      ctx.font='bold 7px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#ffe5a2';
      ctx.fillText((p.id===0?'P1':'P2')+' 眩晕',cx,badgeY+5);
      const total=global.DuelCore?.CONFIG.counterStun||.6;
      const remaining=Math.max(0,Math.min(1,((p.stunUntil||time)-time)/total));
      R(ctx,'#403a36',cx-16,badgeY+9,32,1);if(remaining>0)R(ctx,'#f8d57d',cx-16,badgeY+9,Math.max(1,Math.ceil(32*remaining)),1);
      for(let i=0;i<16;i++) {
        const a=i*Math.PI/8;
        R(ctx,'#b19a6680',cx+Math.cos(a)*11,hy+Math.sin(a)*3,1,1);
      }
      for(let i=0;i<4;i++) {
        const a=time*9+i*Math.PI/2,sx=Math.round(cx+Math.cos(a)*12),sy=Math.round(hy+Math.sin(a)*4);
        R(ctx,'#635535',sx-2,sy-2,5,5);
        R(ctx,'#efb951',sx-2,sy,5,1);R(ctx,'#efb951',sx,sy-2,1,5);
        R(ctx,'#ffedb0',sx-1,sy,3,1);R(ctx,'#ffedb0',sx,sy-1,1,3);
        R(ctx,'#fff7cf',sx,sy,1,1);
      }
      ctx.restore();
    }
  }
  function sheet(action='walk',palette=0,scale=1) {
    const facings=['down','left','right','up'],c=document.createElement('canvas');c.width=WIDTH*POSES[action].length*scale;c.height=HEIGHT*4*scale;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
    for(let row=0;row<4;row++)for(let f=0;f<POSES[action].length;f++)ctx.drawImage(sprite(action,facings[row],f,palette),f*WIDTH*scale,row*HEIGHT*scale,WIDTH*scale,HEIGHT*scale);
    return c;
  }
  function metadata(action='walk',palette=0) {
    const frames={},facings=['down','left','right','up'],count=POSES[action].length;
    for(let row=0;row<facings.length;row++)for(let frame=0;frame<count;frame++)frames[`${action}_${facings[row]}_${String(frame).padStart(2,'0')}`]={frame:{x:frame*WIDTH,y:row*HEIGHT,w:WIDTH,h:HEIGHT},duration:Math.round(1000/META[action].fps),anchor:{...ANCHOR},facing:facings[row],index:frame};
    return {name:`taiting-${action}-${palette}`,version:1,image:`taiting-${action}-${palette}-${WIDTH}x${HEIGHT}.png`,size:{w:WIDTH*count,h:HEIGHT*4},frameSize:{w:WIDTH,h:HEIGHT},bodyEnvelope:{w:32,h:40},anchor:{...ANCHOR},action,character:PALETTES[palette].name,loop:META[action].loop,fps:META[action].fps,timingModel:'nominal-preview',timingNote:'Durations describe the animation workshop preview. Combat remaps attack frames to the simulation windup, impact, and recovery times.',facings,frames};
  }
  global.PixelActor={draw,sprite,sheet,metadata,frameIndex,POSES,META,PALETTES,WIDTH,HEIGHT,ANCHOR};
})(window);
