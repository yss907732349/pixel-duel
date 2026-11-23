(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DuelCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const CONFIG = {
    cols: 17, rows: 11, roundSeconds: 180, maxHp: 200, maxMp: 100,
    manaRegen: 3, basicMana: 12, basicDamage: 12, basicWindup: 0.22,
    moveCooldown: 0.22, blockWindow: 0.18, blockCooldown: 0.8,
    blockReduction: 0.8, counterDamage: 16, counterStun: 0.6,
    dodgeDistance: 2, dodgeCost: 18, dodgeCooldown: 0.7, dodgeWindow: 0.22, dodgeDamage: 18,
    comboDuration: 10, doublePressWindow: 0.23,
    obstacles: [{x:3,y:3},{x:3,y:7},{x:13,y:3},{x:13,y:7}]
  };
  const CHARACTER_DEFS = {
    swordsman: {
      id: 'swordsman', name: '流影',
      skills: [
        {name:'一式 · 断流', cells:3, damage:24, cost:20, windup:0.32},
        {name:'二式 · 回岚', cells:6, damage:32, cost:24, windup:0.42},
        {name:'三式 · 惊鸿', cells:9, damage:44, cost:30, windup:0.54}
      ]
    }
  };
  function normalizeDirection(d) {
    if (!d || (!d.x && !d.y)) return null;
    return Math.abs(d.x || 0) >= Math.abs(d.y || 0)
      ? {x:Math.sign(d.x),y:0} : {x:0,y:Math.sign(d.y)};
  }
  function getAttackCells(player, stage = 1, kind = 'skill') {
    const d = normalizeDirection(player.facing) || {x:1,y:0};
    if (kind === 'basic') return [{x:player.x+d.x,y:player.y+d.y}];
    const cells = [];
    // The opener is a narrow thrust along facing; later stages widen to fans.
    if (stage === 1) {
      for (let depth=1; depth<=3; depth++) cells.push({x:player.x+d.x*depth,y:player.y+d.y*depth});
      return cells;
    }
    for (let depth=1; depth<=Math.min(3, Math.max(1, stage)); depth++) {
      for (let side=-1; side<=1; side++) {
        cells.push({x:player.x+d.x*depth-d.y*side,y:player.y+d.y*depth+d.x*side});
      }
    }
    return cells;
  }
  const contains = (cells, p) => cells.some(c => c.x === p.x && c.y === p.y);
  const EPS = 1e-8;

  class Match {
    constructor(options = {}) {
      this.mode = options.mode || 'duel';
      this.characterId = options.characterId || 'swordsman';
      this.trainingMode = options.trainingMode || 'sparring';
      this.reset();
    }
    reset(mode) {
      if (mode) this.mode = mode;
      this.time=0; this.remaining=CONFIG.roundSeconds; this.started=true;
      this.paused=false; this.winner=null; this.attacks=[]; this.effects=[];
      this.events=[]; this.serial=0; this.aiNext=0.8;
      this.obstacles=CONFIG.obstacles.map(c=>({...c}));
      this.players = [0,1].map(id => ({
        id, characterId:this.characterId, x:id===0?5:11, y:5,
        drawX:id===0?5:11, drawY:5, facing:{x:id===0?1:-1,y:0},
        hp:CONFIG.maxHp, maxHp:CONFIG.maxHp, mp:CONFIG.maxMp, maxMp:CONFIG.maxMp,
        combo:0,comboUntil:0,pendingSkill:null,lastSkillPress:-Infinity,
        state:'idle',stateUntil:0,stunUntil:0,invulnUntil:0,blockUntil:0,
        moveUntil:0,cooldowns:{basic:0,skill:0,block:0,dodge:0}
      }));
      this.event('start',this.mode==='training'?'练习开始':'对决开始');
      return this;
    }
    event(type,text,player) {
      const e={id:++this.serial,type,text,player,time:this.time};
      this.events.push(e); if(this.events.length>24) this.events.shift();
      return e;
    }
    effect(type,p,text,duration=0.65) {
      this.effects.push({id:++this.serial,type,x:p.x,y:p.y,time:this.time,until:this.time+duration,player:p.id,text});
    }
    walkable(x,y,exceptId) {
      return x>=0 && x<CONFIG.cols && y>=0 && y<CONFIG.rows &&
        !this.obstacles.some(c=>c.x===x&&c.y===y) &&
        !this.players.some(p=>p.id!==exceptId&&p.x===x&&p.y===y&&p.hp>0);
    }
    canAct(p) {
      return p.hp>0 && this.time+EPS>=p.stunUntil &&
        (this.time+EPS>=p.stateUntil || p.state==='move' || p.state==='idle');
    }
    act(id,action,direction) {
      if(this.paused || !this.started || this.winner!==null) return false;
      const p=this.players[id];
      if(!p || p.hp<=0 || this.time+EPS<p.stunUntil) return false;
      const d=normalizeDirection(direction);
      if(action==='move') {
        if(!d || !this.canAct(p) || this.time+EPS<p.moveUntil) return false;
        p.facing=d;
        if(!this.walkable(p.x+d.x,p.y+d.y,p.id)) return false;
        p.x+=d.x; p.y+=d.y; p.moveUntil=this.time+CONFIG.moveCooldown;
        p.state='move'; p.stateUntil=p.moveUntil;
        return true;
      }
      // A second press discards stored stages without paying for a follow-up.
      // Stored follow-ups wait 230ms, so a quick double press cannot fire one.
      if(action==='skill' && p.combo>0 && this.time-p.lastSkillPress<=CONFIG.doublePressWindow+EPS) {
        p.combo=0; p.comboUntil=0; p.pendingSkill=null; p.lastSkillPress=-Infinity;
        this.effect('reset',p,'连段清零'); this.event('comboReset','连段已清零',id);
        return true;
      }
      if(!this.canAct(p)) return false;
      if(d) p.facing=d;
      if(action==='basic') return this.attack(p,'basic');
      if(action==='skill') {
        if(this.time+EPS<p.cooldowns.skill || p.pendingSkill) return false;
        p.lastSkillPress=this.time;
        if(p.combo>0) {
          const def=CHARACTER_DEFS[p.characterId].skills[p.combo];
          if(p.mp<def.cost) { this.noMana(p); return false; }
          p.pendingSkill={at:this.time+CONFIG.doublePressWindow,stage:p.combo+1};
          this.effect('ready',p,'连按两次取消',0.23);
          return true;
        }
        return this.attack(p,'skill');
      }
      if(action==='block') {
        if(this.time+EPS<p.cooldowns.block) return false;
        p.pendingSkill=null; p.blockUntil=this.time+CONFIG.blockWindow;
        p.state='block'; p.stateUntil=p.blockUntil;
        p.cooldowns.block=this.time+CONFIG.blockCooldown;
        this.effect('block',p,'',CONFIG.blockWindow); return true;
      }
      if(action==='dodge') {
        if(this.time+EPS<p.cooldowns.dodge) return false;
        if(p.mp<CONFIG.dodgeCost) {this.noMana(p);return false;}
        p.pendingSkill=null;
        const from={x:p.x,y:p.y};
        const dodgeDirection=d || p.facing;
        let to={...from};
        for(let n=0;n<CONFIG.dodgeDistance;n++) {
          const next={x:to.x+dodgeDirection.x,y:to.y+dodgeDirection.y};
          if(!this.walkable(next.x,next.y,p.id)) break;
          to=next;
        }
        if(to.x===from.x&&to.y===from.y) return false;
        p.mp-=CONFIG.dodgeCost; p.facing={...dodgeDirection};
        p.cooldowns.dodge=this.time+CONFIG.dodgeCooldown;
        this.effect('afterimage',p,'',0.28);
        p.x=to.x;p.y=to.y;p.state='dodge';p.stateUntil=this.time+0.18;
        p.invulnUntil=this.time+0.18;
        const incoming=this.attacks.find(a=>a.owner!==id && a.kind==='skill' && !a.resolved &&
          a.impactAt+EPS>=this.time && a.impactAt-this.time<=CONFIG.dodgeWindow+EPS &&
          !contains(a.cells,from) && contains(a.cells,to));
        if(incoming) {
          const enemy=this.players[incoming.owner];
          const back={x:enemy.x-enemy.facing.x,y:enemy.y-enemy.facing.y};
          if(this.walkable(back.x,back.y,id)) {
            p.x=back.x;p.y=back.y;p.facing={...enemy.facing};
            p.invulnUntil=this.time+CONFIG.dodgeWindow;
            this.damage(enemy,CONFIG.dodgeDamage,id,'blink');
            this.effect('blink',p,'闪现追击');this.event('blink','完美闪避 · 背袭',id);
          }
        }
        this.checkWinner(); return true;
      }
      return false;
    }
    noMana(p) { this.effect('nomana',p,'蓝量不足',0.5);this.event('nomana','蓝量不足',p.id); }
    attack(p,kind,forcedStage) {
      if(this.time+EPS<p.cooldowns[kind]) return false;
      const stage=kind==='skill'?(forcedStage || p.combo+1):1;
      const def=kind==='skill'?CHARACTER_DEFS[p.characterId].skills[stage-1]:
        {cost:0,damage:CONFIG.basicDamage,windup:CONFIG.basicWindup,name:'平砍'};
      if(p.mp<def.cost) {this.noMana(p);return false;}
      p.mp-=def.cost;
      const cells=getAttackCells(p,stage,kind).filter(c=>c.x>=0&&c.x<CONFIG.cols&&c.y>=0&&c.y<CONFIG.rows);
      this.attacks.push({id:++this.serial,owner:p.id,cells,startsAt:this.time,
        impactAt:this.time+def.windup,endsAt:this.time+def.windup+0.16,
        damage:def.damage,kind,stage,resolved:false});
      p.state='attack';p.stateUntil=this.time+def.windup+0.12;
      p.cooldowns[kind]=this.time+(kind==='basic'?0.4:def.windup+0.16);
      if(kind==='skill') {
        p.combo=stage===3?0:stage; p.comboUntil=p.combo?this.time+CONFIG.comboDuration:0;
        this.event('skill',def.name,p.id);
      }
      return true;
    }
    damage(p,amount,source,type='hit') {
      if(p.hp<=0) return;
      p.hp=Math.max(0,p.hp-amount);
      this.effect(type,p,'−'+amount);
      if(p.hp<=0) {p.state='dead';p.stateUntil=Infinity;p.pendingSkill=null;}
      else if(type!=='parry') {
        p.pendingSkill=null;
        if(this.time>=p.stunUntil && p.state!=='attack') {
          p.state='hurt';p.stateUntil=this.time+0.12;
        }
      }
    }
    resolveAttack(a, committed = false) {
      a.resolved=true;
      const source=this.players[a.owner];
      const target=this.players[1-a.owner];
      if(!committed && (source.hp<=0 || source.stunUntil>this.time+EPS)) return;
      if(!contains(a.cells,target) || target.hp<=0 || this.time+EPS<target.invulnUntil) return;
      if(target.state==='block' && this.time<=target.blockUntil+EPS) {
        const dealt=Math.round(a.damage*(1-CONFIG.blockReduction));
        this.damage(target,dealt,source.id,'parry');
        this.damage(source,CONFIG.counterDamage,target.id,'counter');
        source.stunUntil=this.time+CONFIG.counterStun;
        if(source.hp>0) {source.state='stun';source.stateUntil=source.stunUntil;}
        source.pendingSkill=null;
        this.effect('parry',target,'弹反！');this.event('parry','弹反成功 · 减伤 80%',target.id);
        // A parried strike does not count as a successful normal-attack hit.
      } else {
        this.damage(target,a.damage,source.id);
        if(a.kind==='basic') source.mp=Math.min(source.maxMp,source.mp+CONFIG.basicMana);
        this.event('hit',a.kind==='basic'?'普攻命中 · 回蓝 +12':'技能命中',source.id);
      }
    }
    step(dt) {
      if(this.paused || !this.started || this.winner!==null || !Number.isFinite(dt) || dt<=0) return;
      // Small fixed integration slices keep impact windows stable at low FPS.
      let left=Math.min(dt,300);
      while(left>EPS && this.winner===null) {
        const slice=Math.min(0.02,left);left-=slice;this.time+=slice;
        this.remaining=Math.max(0,CONFIG.roundSeconds-this.time);
        for(const p of this.players) {
          p.mp=Math.min(p.maxMp,p.mp+CONFIG.manaRegen*slice);
          p.drawX+=(p.x-p.drawX)*Math.min(1,slice*24);
          p.drawY+=(p.y-p.drawY)*Math.min(1,slice*24);
          if(p.combo>0 && this.time>p.comboUntil+EPS && !p.pendingSkill) {
            p.combo=0;p.comboUntil=0;p.lastSkillPress=-Infinity;
            this.event('comboExpired','连段保存结束',p.id);
          }
          if(p.state!=='dead' && this.time>p.stateUntil+EPS) p.state='idle';
          if(p.pendingSkill && this.time+EPS>=p.pendingSkill.at) {
            const pending=p.pendingSkill;p.pendingSkill=null;
            if(this.canAct(p)) this.attack(p,'skill',pending.stage);
          }
        }
        if(this.mode==='training' && this.trainingMode==='sparring') this.updateAI();
        // Resolve equal-time impacts as a batch: neither keyboard's input order
        // gets priority when both players land a lethal strike together.
        const due=this.attacks.filter(a=>!a.resolved && this.time+EPS>=a.impactAt);
        const committed=due.filter(a=>this.players[a.owner].hp>0 && this.players[a.owner].stunUntil<=this.time+EPS);
        for(const a of due) a.resolved=true;
        for(const a of committed) this.resolveAttack(a,true);
        this.attacks=this.attacks.filter(a=>this.time<a.endsAt+EPS);
        this.effects=this.effects.filter(e=>this.time<e.until);
        this.checkWinner();
      }
    }
    updateAI() {
      if(this.time<this.aiNext) return;
      const p=this.players[1],enemy=this.players[0];
      if(!this.canAct(p)) {this.aiNext=this.time+0.1;return;}
      const dx=enemy.x-p.x,dy=enemy.y-p.y;
      const dir=Math.abs(dx)>=Math.abs(dy)?{x:Math.sign(dx),y:0}:{x:0,y:Math.sign(dy)};
      if(!dir.x&&!dir.y) return;
      p.facing=dir;
      if(Math.abs(dx)+Math.abs(dy)<=3 && (dx===0||dy===0)) {
        this.act(1,p.mp>=30?'skill':'basic');this.aiNext=this.time+1.05;
      } else {
        if(!this.act(1,'move',dir)) {
          const fallback=dir.x?{x:0,y:dy?Math.sign(dy):1}:{x:dx?Math.sign(dx):1,y:0};
          this.act(1,'move',fallback);
        }
        this.aiNext=this.time+0.32;
      }
    }
    checkWinner() {
      if(this.winner!==null) return;
      const dead=this.players.map(p=>p.hp<=0);
      if(dead[0]&&dead[1]) this.winner='draw';
      else if(dead[0]) this.winner=1;
      else if(dead[1]) this.winner=0;
      else if(this.remaining<=EPS) this.winner=this.players[0].hp===this.players[1].hp?'draw':this.players[0].hp>this.players[1].hp?0:1;
      if(this.winner!==null) {
        this.remaining=Math.max(0,this.remaining);
        this.event('roundEnd',this.winner==='draw'?'势均力敌 · 平局':`玩家 ${this.winner+1} 获胜`,this.winner);
      }
    }
  }
  return {Match,CONFIG,CHARACTER_DEFS,getAttackCells,normalizeDirection};
});
