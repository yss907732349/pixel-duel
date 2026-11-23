const test=require('node:test');
const assert=require('node:assert/strict');
const {Match,CONFIG,getAttackCells}=require('../js/combat.js');
function match(){return new Match({mode:'duel'});}
function adjacent(m){Object.assign(m.players[0],{x:5,y:5,facing:{x:1,y:0}});Object.assign(m.players[1],{x:6,y:5,facing:{x:-1,y:0}});}
function skillAgainst(m, target={x:7,y:5}){Object.assign(m.players[0],{x:5,y:5,facing:{x:1,y:0}});Object.assign(m.players[1],target);m.act(0,'skill');}

test('range has exactly 3/6/9 grid cells, rotating with all four facings',()=>{
  for(const facing of [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]) {
    for(let stage=1;stage<=3;stage++) {
      const cells=getAttackCells({x:8,y:5,facing},stage);
      assert.equal(cells.length,stage*3);
      assert.equal(new Set(cells.map(p=>`${p.x},${p.y}`)).size,stage*3);
      for(const c of cells) {
        const depth=(c.x-8)*facing.x+(c.y-5)*facing.y;
        const side=-(c.x-8)*facing.y+(c.y-5)*facing.x;
        assert.ok(depth>=1&&depth<=(stage===1?3:stage));
        assert.ok(stage===1?side===0:Math.abs(side)<=1);
      }
    }
    assert.deepEqual(getAttackCells({x:8,y:5,facing},1,'basic'),[{x:8+facing.x,y:5+facing.y}]);
  }
});
test('telegraph does no early damage and uses locked cast cells',()=>{
  const m=match();adjacent(m);assert.equal(m.act(0,'skill'),true);
  assert.equal(m.attacks[0].cells.length,3);assert.equal(m.players[0].mp,80);
  m.step(.30);assert.equal(m.players[1].hp,200);m.step(.03);assert.equal(m.players[1].hp,176);
  assert.ok(Math.abs(m.players[0].mp-80.99)<.001);
});
test('normal attack restores mana only when it hits',()=>{
  const m=match();adjacent(m);m.players[0].mp=30;m.act(0,'basic');m.step(.22);
  assert.equal(m.players[1].hp,188);assert.ok(Math.abs(m.players[0].mp-42.66)<.001);
  const n=match();n.players[0].mp=30;n.act(0,'basic');n.step(.22);
  assert.ok(Math.abs(n.players[0].mp-30.66)<.001);
});
test('parry in the 180ms window reduces damage 80%, counters and stuns',()=>{
  const m=match();adjacent(m);m.act(0,'skill');m.step(.2);assert.equal(m.act(1,'block'),true);m.step(.12);
  assert.equal(m.players[1].hp,195);assert.equal(m.players[0].hp,184);
  assert.equal(m.players[0].state,'stun');assert.ok(m.players[0].stunUntil>m.time);
  assert.equal(m.act(0,'basic'),false);
  m.step(.59);assert.equal(m.act(0,'basic'),false);
  m.step(.01);assert.equal(m.act(0,'basic'),true);
});
test('early guard expires; guard outside target cells never counterattacks',()=>{
  const m=match();adjacent(m);m.act(0,'skill');m.act(1,'block');m.step(.33);
  assert.equal(m.players[1].hp,176);assert.equal(m.players[0].hp,200);
  const n=match();n.act(0,'skill');n.step(.2);n.act(1,'block');n.step(.13);
  assert.equal(n.players[0].hp,200);assert.equal(n.players[1].hp,200);
});
test('perfect dodge requires outside -> inside in the final 220ms and blinks behind attacker',()=>{
  const m=match();skillAgainst(m,{x:7,y:3});m.step(.12);
  assert.equal(m.act(1,'dodge',{x:0,y:1}),true);
  assert.equal(m.players[1].x,4);assert.equal(m.players[1].y,5);
  assert.equal(m.players[0].hp,182);assert.ok(m.players[1].mp<83);
  assert.ok(m.events.some(e=>e.type==='blink'));
  m.step(.21);assert.equal(m.players[1].hp,200);
});
test('dodge beginning inside is ordinary, and early entry is not a perfect dodge',()=>{
  const m=match();skillAgainst(m,{x:6,y:5});m.step(.12);m.act(1,'dodge',{x:1,y:0});
  assert.equal(m.players[1].x,8);assert.equal(m.players[1].y,5);assert.equal(m.players[0].hp,200);
  assert.ok(!m.events.some(e=>e.type==='blink'));
  const n=match();skillAgainst(n,{x:7,y:3});n.act(1,'dodge',{x:0,y:1});
  assert.equal(n.players[1].x,7);assert.equal(n.players[0].hp,200);n.step(.33);assert.equal(n.players[1].hp,176);
});
test('perfect dodge is unavailable after impact and does not teleport into a blocked rear cell',()=>{
  const m=match();skillAgainst(m,{x:7,y:3});m.step(.33);m.act(1,'dodge',{x:0,y:1});
  assert.equal(m.players[1].x,7);assert.equal(m.players[1].y,5);
  assert.equal(m.players[0].hp,200);assert.ok(!m.events.some(e=>e.type==='blink'));
  const n=match();skillAgainst(n,{x:7,y:3});n.obstacles.push({x:4,y:5});n.step(.12);
  n.act(1,'dodge',{x:0,y:1});
  assert.equal(n.players[1].x,7);assert.equal(n.players[1].y,5);
  assert.equal(n.players[0].hp,200);assert.ok(!n.events.some(e=>e.type==='blink'));
});
test('ordinary dodge moves exactly two grid cells in every direction for either player',()=>{
  for(const id of [0,1]) for(const direction of [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]) {
    const m=match();const p=m.players[id];Object.assign(p,{x:8,y:5,mp:50,facing:direction});
    Object.assign(m.players[1-id],{x:15,y:9});
    assert.equal(m.act(id,'dodge'),true);
    assert.deepEqual({x:p.x,y:p.y},{x:8+direction.x*2,y:5+direction.y*2});
    assert.equal(p.mp,32);assert.ok(!m.events.some(e=>e.type==='blink'));
  }
});
test('two-cell dodge cannot jump pillars, the other player or arena bounds and failed dodges cost nothing',()=>{
  const cases=[
    {x:2,y:3,d:{x:1,y:0}}, // pillar at 3,3
    {x:0,y:5,d:{x:-1,y:0}}, {x:16,y:5,d:{x:1,y:0}},
    {x:8,y:0,d:{x:0,y:-1}}, {x:8,y:10,d:{x:0,y:1}},
    {x:10,y:5,d:{x:1,y:0}} // enemy at 11,5
  ];
  for(const fixture of cases) {
    const m=match();const p=m.players[0];Object.assign(p,{x:fixture.x,y:fixture.y,mp:50});
    assert.equal(m.act(0,'dodge',fixture.d),false);
    assert.deepEqual({x:p.x,y:p.y},{x:fixture.x,y:fixture.y});
    assert.equal(p.mp,50);assert.equal(p.cooldowns.dodge,0);assert.equal(p.invulnUntil,0);
  }
});
test('two-cell dodge stops after one cell if its second step hits a pillar, player or arena edge',()=>{
  const cases=[
    {x:1,y:3,d:{x:1,y:0},end:{x:2,y:3}},
    {x:9,y:5,d:{x:1,y:0},end:{x:10,y:5}},
    {x:15,y:5,d:{x:1,y:0},end:{x:16,y:5}},
    {x:1,y:5,d:{x:-1,y:0},end:{x:0,y:5}},
    {x:8,y:1,d:{x:0,y:-1},end:{x:8,y:0}},
    {x:8,y:9,d:{x:0,y:1},end:{x:8,y:10}}
  ];
  for(const fixture of cases) {
    const m=match(),p=m.players[0];Object.assign(p,{x:fixture.x,y:fixture.y,mp:50});
    assert.equal(m.act(0,'dodge',fixture.d),true);
    assert.deepEqual({x:p.x,y:p.y},fixture.end);assert.equal(p.mp,32);
    assert.ok(p.cooldowns.dodge>m.time);assert.ok(p.invulnUntil>m.time);
  }
});
test('parry accepts the exact final 180ms boundary and cannot reverse an already resolved hit',()=>{
  const m=match();adjacent(m);m.act(0,'skill');m.step(.14);m.act(1,'block');m.step(.18);
  assert.equal(m.players[1].hp,195);assert.equal(m.players[0].hp,184);
  const n=match();adjacent(n);n.act(0,'skill');n.step(.33);assert.equal(n.players[1].hp,176);
  n.step(.13);assert.equal(n.act(1,'block'),true);n.step(.2);
  assert.equal(n.players[0].hp,200);assert.equal(n.players[1].hp,176);
});
test('mana shortage prevents skill/dodge, regen caps at maximum',()=>{
  const m=match();m.players[0].mp=0;assert.equal(m.act(0,'skill'),false);assert.equal(m.act(0,'dodge'),false);
  m.step(4);assert.ok(Math.abs(m.players[0].mp-12)<.001);assert.equal(m.act(0,'skill'),false);
  m.step(3);assert.ok(Math.abs(m.players[0].mp-21)<.001);assert.equal(m.act(0,'skill'),true);
  m.step(40);assert.equal(m.players[0].mp,100);
});
test('stored combo follows 3 -> 6 -> 9 cells and resets after the finisher',()=>{
  const m=match();m.act(0,'skill');assert.equal(m.players[0].combo,1);m.step(.6);
  m.act(0,'skill');assert.equal(m.attacks.length,0);m.step(.24);
  assert.equal(m.attacks[0].stage,2);assert.equal(m.attacks[0].cells.length,6);assert.equal(m.players[0].combo,2);
  m.step(.65);m.act(0,'skill');m.step(.24);
  assert.equal(m.attacks[0].stage,3);assert.equal(m.attacks[0].cells.length,9);assert.equal(m.players[0].combo,0);
});
test('double press clears stored combo without spending follow-up mana',()=>{
  const m=match();m.act(0,'skill');m.step(.6);const mp=m.players[0].mp;
  m.act(0,'skill');m.step(.1);m.act(0,'skill');m.step(.2);
  assert.equal(m.players[0].combo,0);assert.equal(m.attacks.length,0);
  assert.ok(Math.abs(m.players[0].mp-(mp+.9))<.001);
});
test('stored stage expires at ten seconds and normal attacks preserve it',()=>{
  const m=match();m.act(0,'skill');m.step(.6);m.act(0,'basic');m.step(.5);assert.equal(m.players[0].combo,1);
  m.step(8.8);assert.equal(m.players[0].combo,1);m.step(.2);assert.equal(m.players[0].combo,0);
});
test('movement is cardinal, blocked by other player, pillars, bounds and cooldown',()=>{
  const m=match();adjacent(m);assert.equal(m.act(0,'move',{x:1,y:0}),false);
  Object.assign(m.players[0],{x:2,y:3});assert.equal(m.act(0,'move',{x:1,y:0}),false);
  Object.assign(m.players[0],{x:0,y:0});assert.equal(m.act(0,'move',{x:-1,y:0}),false);
  assert.equal(m.act(0,'move',{x:1,y:0}),true);assert.equal(m.act(0,'move',{x:1,y:0}),false);
  m.step(.22);assert.equal(m.act(0,'move',{x:0,y:1}),true);assert.equal(m.players[0].y,1);
});
test('walking waits 220ms between cells for both players, including the exact boundary',()=>{
  for(const id of [0,1]) {
    const m=match();const p=m.players[id];Object.assign(p,{x:8,y:5});Object.assign(m.players[1-id],{x:15,y:9});
    assert.equal(m.act(id,'move',{x:0,y:-1}),true);assert.equal(p.y,4);
    m.step(.219);assert.equal(m.act(id,'move',{x:0,y:-1}),false);assert.equal(p.y,4);
    m.step(.001);assert.equal(m.act(id,'move',{x:0,y:-1}),true);assert.equal(p.y,3);
    assert.equal(m.act(id,'move',{x:0,y:-1}),false);
  }
});
test('KO and timer stop the round, pause freezes the simulation',()=>{
  const m=match();adjacent(m);m.players[1].hp=10;m.act(0,'basic');m.step(.3);assert.equal(m.winner,0);
  const t=m.time;m.step(1);assert.equal(m.time,t);assert.equal(m.act(0,'move',{x:1,y:0}),false);
  const n=match();n.paused=true;n.step(9);assert.equal(n.time,0);n.paused=false;n.step(180);assert.equal(n.winner,'draw');assert.equal(n.remaining,0);
  n.reset();assert.equal(n.winner,null);assert.equal(n.players[1].hp,200);
});
test('simultaneous lethal hits trade fairly regardless of input order',()=>{
  for(const order of [[0,1],[1,0]]) {
    const m=match();adjacent(m);m.players.forEach(p=>p.hp=12);
    order.forEach(id=>m.act(id,'basic'));m.step(.22);
    assert.equal(m.players[0].hp,0);assert.equal(m.players[1].hp,0);assert.equal(m.winner,'draw');
  }
});
test('training dummy stands still and sparring opponent actually attacks',()=>{
  const m=new Match({mode:'training',trainingMode:'dummy'});m.step(5);assert.equal(m.players[1].x,11);assert.equal(m.players[0].hp,200);
  const n=new Match({mode:'training'});n.step(7);assert.ok(n.players[1].x<11);assert.ok(n.events.some(e=>e.player===1&&e.type==='skill'));
});
