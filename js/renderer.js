/* The view is disposable: all combat truth belongs to DuelCore.Match. */
(function () {
  'use strict';
  const W = 544, H = 352, TILE = 24, OX = 68, OY = 44;
  const COLORS = ['#68e4da', '#ff8a72'];
  const DARKS = ['#245a62', '#773e4c'];
  const OBSTACLES = [{ x: 3, y: 3 }, { x: 3, y: 7 }, { x: 13, y: 3 }, { x: 13, y: 7 }];
  function random(seed) {
    let n = seed;
    return function () { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296; };
  }
  function canvas() { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
  function rect(c, color, x, y, w, h) { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h); }
  function line(c, color, x1, y1, x2, y2, width = 1) {
    c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  }
  function pixelEllipse(c, color, x, y, w, h) {
    rect(c, color, x - w / 2 + 2, y - h / 2, w - 4, h);
    rect(c, color, x - w / 2, y - h / 2 + 1, w, Math.max(1, h - 2));
  }
  function text(c, value, x, y, color = '#b7c9bd', size = 6, align = 'center') {
    c.font = `${size}px monospace`; c.textAlign = align; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(value, Math.round(x), Math.round(y));
  }
  function shrub(c, x, y, size, rng) {
    pixelEllipse(c, '#102e2d', x + 2, y + 3, size + 8, Math.round(size * .7));
    pixelEllipse(c, '#1d4034', x, y, size, Math.round(size * .75));
    pixelEllipse(c, '#2b5741', x - 2, y - 2, size - 5, Math.round(size * .5));
    for (let i = 0; i < size; i++) {
      const px = x + (rng() - .5) * size, py = y + (rng() - .5) * size * .5;
      rect(c, rng() > .7 ? '#71935a' : '#3c6950', px, py, 2, 1);
    }
  }
  function pillar(c, x, y) {
    pixelEllipse(c, '#132826', x + 3, y + 5, 23, 9);
    rect(c, '#202c2c', x - 9, y - 13, 18, 18);
    rect(c, '#53635a', x - 8, y - 15, 16, 16);
    rect(c, '#718074', x - 7, y - 16, 14, 3);
    rect(c, '#899384', x - 8, y - 17, 15, 2);
    rect(c, '#35443d', x + 4, y - 13, 4, 15);
    rect(c, '#344c41', x - 7, y - 5, 5, 6);
    rect(c, '#4f764e', x - 9, y - 1, 6, 3);
    rect(c, '#93a379', x - 8, y - 1, 3, 1);
    rect(c, '#33443d', x - 3, y - 11, 5, 1);
    rect(c, '#344b42', x - 2, y - 10, 1, 6);
    rect(c, '#698a62', x + 3, y - 16, 3, 3);
    rect(c, '#354f40', x + 5, y - 13, 2, 9);
  }
  function makeMap() {
    const map = canvas(), c = map.getContext('2d'), rng = random(20913);
    rect(c, '#0f2027', 0, 0, W, H);
    // Quiet, deep water surrounds the raised stone platform.
    for (let i = 0; i < 1000; i++) {
      const x = Math.floor(rng() * W), y = Math.floor(rng() * H);
      rect(c, ['#142a30', '#1a3437', '#203b3b', '#10262d'][Math.floor(rng() * 4)], x, y, 2 + Math.floor(rng() * 9), 1);
    }
    rect(c, '#0c1c23', OX - 11, OY - 11, 430, 290);
    rect(c, '#344b43', OX - 9, OY - 9, 426, 282);
    rect(c, '#637463', OX - 9, OY - 9, 426, 3);
    rect(c, '#263a34', OX - 10, OY + 264, 428, 9);
    rect(c, '#1b2c2c', OX - 10, OY + 271, 428, 5);
    // Each stone is fixed to its logical combat cell.
    for (let row = 0; row < 11; row++) for (let col = 0; col < 17; col++) {
      const x = OX + col * TILE, y = OY + row * TILE;
      const base = ['#3d514b', '#40554e', '#3b514a', '#42574e', '#3c514b'][Math.floor(rng() * 5)];
      rect(c, '#243d38', x, y, 24, 24);
      rect(c, base, x + 1, y + 1, 22, 22);
      rect(c, '#586b5a', x + 2, y + 1, 20, 1);
      rect(c, '#2e443c', x + 2, y + 22, 20, 1);
      rect(c, '#354d43', x + 22, y + 3, 1, 18);
      for (let j = 0; j < 5; j++) rect(c, rng() > .5 ? '#4a6053' : '#344b42', x + 3 + rng() * 17, y + 3 + rng() * 17, 1 + Math.floor(rng() * 3), 1);
      if (rng() < .24) {
        const cx = x + 5 + Math.floor(rng() * 12), cy = y + 4 + Math.floor(rng() * 8);
        rect(c, '#2b443c', cx, cy, 1, 6); rect(c, '#2b443c', cx + 1, cy + 5, 4, 1); rect(c, '#2b443c', cx + 4, cy + 6, 1, 5);
      }
      if ((row === 0 || row === 10 || col === 0 || col === 16) && rng() > .35) {
        for (let j = 0; j < 9; j++) rect(c, ['#59784d', '#456b4b', '#6f8953'][j % 3], x + 1 + rng() * 21, y + 1 + rng() * 20, 2, 1);
      }
    }
    // Faint ritual marks make the arena a place, without obscuring its grid.
    c.globalAlpha = .19;
    c.strokeStyle = '#a5b88b'; c.lineWidth = 1;
    c.beginPath(); c.arc(272, 176, 43, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(272, 176, 38, 0, Math.PI * 2); c.stroke();
    for (let a = 0; a < 4; a++) { c.save(); c.translate(272, 176); c.rotate(a * Math.PI / 2); line(c, '#a5b88b', -4, -46, 0, -51); line(c, '#a5b88b', 0, -51, 4, -46); c.restore(); }
    c.globalAlpha = 1;
    for (let i = 0; i < 18; i++) {
      const x = OX - 9 + i * 24;
      line(c, '#283d36', x, OY - 8, x, OY - 3);
      line(c, '#394d40', x, OY + 265, x, OY + 271);
      rect(c, '#596a55', x + 2, OY + 264, 19, 1);
    }
    // Broad temple steps, broken lintel, and overgrown edges frame the map.
    rect(c, '#1c302f', 217, 22, 110, 14);
    for (let i = 0; i < 4; i++) { rect(c, ['#2c4039', '#405346', '#4c5e4d', '#5c6b55'][i], 229 - i * 4, 22 + i * 4, 86 + i * 8, 3); }
    for (const x of [184, 345]) {
      rect(c, '#192d2a', x - 4, 6, 16, 30); rect(c, '#3e5443', x, 8, 8, 26);
      rect(c, '#5c6d52', x, 8, 3, 25); rect(c, '#344a3b', x - 3, 31, 15, 5);
      rect(c, '#53664a', x - 3, 5, 15, 4);
    }
    rect(c, '#1e352e', 184, 1, 174, 6); rect(c, '#506149', 181, 1, 179, 3);
    for (let i = 0; i < 36; i++) {
      const left = i % 2 === 0;
      const x = left ? rng() * 56 + 2 : 492 + rng() * 50;
      const y = 15 + rng() * 305;
      shrub(c, x, y, 10 + Math.floor(rng() * 17), rng);
    }
    for (let i = 0; i < 15; i++) {
      const x = 32 + rng() * 480, y = i < 7 ? 13 + rng() * 17 : 325 + rng() * 25;
      shrub(c, x, y, 8 + Math.floor(rng() * 16), rng);
    }
    // Small stone bridge below the dueling ground.
    rect(c, '#142927', 239, 317, 67, 35);
    for (let i = 0; i < 5; i++) { rect(c, '#46594b', 244, 318 + i * 8, 56, 7); rect(c, '#5d6d57', 245, 318 + i * 8, 54, 1); rect(c, '#304638', 271, 320 + i * 8, 1, 5); }
    rect(c, '#253c32', 240, 315, 5, 37); rect(c, '#5a6e51', 240, 315, 5, 2);
    rect(c, '#253c32', 300, 315, 5, 37); rect(c, '#5a6e51', 300, 315, 5, 2);
    // Lantern mounts and little fallen leaves are fixed scenery.
    for (const [x, y] of [[61, 45], [483, 45], [61, 306], [483, 306]]) {
      rect(c, '#132825', x - 5, y - 2, 10, 10); rect(c, '#45584a', x - 4, y - 4, 8, 9);
      rect(c, '#6c7859', x - 4, y - 4, 8, 2); rect(c, '#162d29', x - 2, y - 10, 4, 8);
    }
    for (let i = 0; i < 34; i++) {
      const x = OX + rng() * 408, y = OY + rng() * 264;
      if (rng() > .6) rect(c, '#9c9254', x, y, 2, 1); else rect(c, '#547650', x, y, 2, 2);
    }
    return map;
  }

  function drawCharacter(c, p, pos, time, attacks) {
    if (window.PixelActor) {
      pixelEllipse(c, '#1d302e', Math.round(pos.x), Math.round(pos.y + 7), 20, 7);
      window.PixelActor.draw(c, p, pos, time, attacks);
      return;
    }
    const x = Math.round(pos.x), y = Math.round(pos.y), color = COLORS[p.id % 2], dark = DARKS[p.id % 2];
    const face = p.facing || { x: 1, y: 0 };
    const walking = p.state === 'move', dead = p.hp <= 0;
    const bob = walking ? Math.round(Math.sin(time * 35)) : 0;
    const swing = attacks.some(a => a.owner === p.id && time >= a.impactAt - .09 && time <= a.endsAt);
    const hurt = (p.state === 'hurt') && Math.floor(time * 35) % 2 === 0;
    pixelEllipse(c, '#1d302e', x, y + 7, 20, 7);
    if (dead) { c.save(); c.translate(x, y + 2); c.rotate(Math.PI / 2); c.globalAlpha = .6; } else c.save();
    if (!dead) c.translate(x, y + bob);
    if (p.state === 'dodge' || time < (p.invulnUntil || 0)) {
      c.globalAlpha = .25;
      rect(c, color, -12 - face.x * 9, -12 - face.y * 9, 12, 18);
      rect(c, color, -17 - face.x * 15, -9 - face.y * 15, 8, 12);
      c.globalAlpha = .85;
    }
    // Cloak silhouette, outlined boots and shoulder plates.
    rect(c, '#14292c', -8, -13, 15, 19);
    rect(c, dark, -7, -12, 13, 15);
    rect(c, dark, -9 + (walking ? Math.round(Math.sin(time * 22) * 2) : 0), -6, 4, 12);
    rect(c, '#172d32', -6, 3, 5, 7); rect(c, '#172d32', 2, 3, 5, 7);
    const step = walking ? Math.sin(time * 26) : 0;
    rect(c, '#75919a', -5, 5 + Math.round(step), 3, 3); rect(c, '#75919a', 3, 5 - Math.round(step), 3, 3);
    rect(c, hurt ? '#fff3da' : color, -6, -12, 11, 5);
    rect(c, '#a4c4bb', -6, -11, 3, 4); rect(c, '#466575', -5, -6, 10, 9);
    rect(c, '#9ab8aa', -3, -5, 6, 5); rect(c, '#415969', -3, -4, 2, 4);
    rect(c, '#c4b88f', -6, 0, 12, 2); rect(c, '#ead3a5', -1, 0, 3, 2);
    // Face, hair, headband and a clear facing-dependent eye line.
    rect(c, '#142a2e', -5, -23, 11, 12);
    rect(c, '#263b44', -4, -22, 9, 10);
    rect(c, '#ebc39c', -3, -18, 7, 6);
    rect(c, '#314550', -5, -23, 10, 6); rect(c, '#506572', -4, -23, 6, 2);
    rect(c, '#314550', -4, -20, 3, 5);
    rect(c, color, -5, -19, 11, 2);
    rect(c, dark, face.x < 0 ? 4 : -9, -17, 5, 2);
    if (face.y < 0) { rect(c, '#314550', -3, -18, 8, 5); rect(c, '#506572', -2, -17, 3, 1); }
    else { rect(c, '#172e33', face.x < 0 ? -3 : 2, -16, 2, 1); rect(c, '#b08377', 0, -13, 3, 1); }
    // The blade follows the player's actual grid direction.
    c.save(); c.translate(face.x * 7, face.y < 0 ? -11 : -3);
    const angle = Math.atan2(face.y, face.x) + (swing ? Math.sin(time * 38) * .95 : -.36);
    c.rotate(angle);
    rect(c, '#192f34', 0, -2, 18, 4); rect(c, '#9ebdc0', 2, -1, 14, 2);
    rect(c, '#e2eee2', 3, -1, 12, 1); rect(c, '#f0e1b5', 0, -4, 2, 8);
    rect(c, '#b39a67', -3, -1, 4, 2); c.restore();
    if (hurt) { c.globalAlpha = .5; rect(c, '#fff5d1', -5, -22, 11, 24); }
    c.restore();
    if (!dead) {
      pixelEllipse(c, color, x, y + 11, 15, 2);
      text(c, p.id === 0 ? 'P1' : 'P2', x, y - 30, color, 6);
    }
    if ((p.state === 'stun' || time < (p.stunUntil || 0)) && !dead) {
      const t = time * 7;
      for (let i = 0; i < 3; i++) { const a = t + i * 2.1; rect(c, '#f5dc8a', x + Math.cos(a) * 9, y - 26 + Math.sin(a) * 3, 2, 2); }
    }
    if (p.state === 'block' && !dead) {
      c.save(); c.translate(x + face.x * 12, y - 7 + face.y * 12); c.rotate(Math.atan2(face.y, face.x));
      c.globalAlpha = .22; rect(c, color, -1, -13, 6, 26); c.globalAlpha = 1;
      line(c, '#d9f6e9', 3, -12, 6, -8, 2); line(c, color, 6, -8, 6, 8, 2); line(c, '#d9f6e9', 6, 8, 3, 12, 2); c.restore();
    }
  }

  class DuelRenderer {
    constructor(parentId, match) {
      this.match = match; this.positions = []; this.map = makeMap(); this.parentId = parentId;
      const view = this;
      this.game = new Phaser.Game({
        type: Phaser.AUTO, parent: parentId, width: W * 2, height: H * 2,
        backgroundColor: '#101d25', pixelArt: true, antialias: false,
        render: { roundPixels: true, antialias: false },
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        audio: { noAudio: true }, banner: false,
        scene: {
          create() {
            this.frameTexture = this.textures.createCanvas('arena-frame', W, H);
            this.frameImage = this.add.image(0, 0, 'arena-frame').setOrigin(0).setScale(2);
            view.scene = this;
            const el = this.game.canvas;
            el.setAttribute('aria-label', '苔庭双人对战地图，青色为玩家一，珊瑚色为玩家二');
            el.setAttribute('role', 'img');
            el.style.imageRendering = 'pixelated';
            view.resize();
          },
          update(_time, delta) {
            view.paint(this.frameTexture.context, Math.min(delta / 1000, .06));
            this.frameTexture.refresh();
          }
        }
      });
      const parent = document.getElementById(parentId);
      if (window.ResizeObserver && parent) {
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(parent);
      }
    }
    setMatch(match) { this.match = match; this.positions = []; this.deathElapsed = 0; }
    resize() {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => {
        const parent = document.getElementById(this.parentId), game = this.game;
        if (!parent || !game || !game.canvas || !game.isBooted) return;
        const box = parent.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) return;
        const ratio = Math.min(box.width / (W * 2), box.height / (H * 2));
        const width = Math.max(1, Math.floor(W * 2 * ratio)), height = Math.max(1, Math.floor(H * 2 * ratio));
        game.scale.setParentSize(box.width, box.height);
        game.scale.displaySize.setSize(width, height);
        // Phaser FIT can retain a stale displaySize across a grid breakpoint.
        // Applying the final measured bounds also makes input coordinates agree.
        game.canvas.style.width = width + 'px'; game.canvas.style.height = height + 'px';
        game.canvas.style.marginLeft = Math.floor((box.width - width) / 2) + 'px';
        game.canvas.style.marginTop = Math.floor((box.height - height) / 2) + 'px';
        game.scale.updateBounds();
      });
    }
    destroy() { cancelAnimationFrame(this.resizeFrame); if (this.resizeObserver) this.resizeObserver.disconnect(); if (this.game) this.game.destroy(true); this.game = null; }
    paint(c, dt) {
      const m = this.match, t = m.time || 0;
      // Combat time stops at a knockout. The final authored falling pose still
      // completes on presentation time until the result overlay pauses it.
      if (m.winner === null || m.winner === undefined) this.deathElapsed = 0;
      else if (!m.paused) this.deathElapsed = Math.min(.65, (this.deathElapsed || 0) + dt);
      c.imageSmoothingEnabled = false; c.globalAlpha = 1;
      c.drawImage(this.map, 0, 0);
      // Animated torchlight is deliberately confined to the frame.
      for (const [x, y] of [[61, 45], [483, 45], [61, 306], [483, 306]]) {
        const f = Math.floor(t * 11 + x) % 3;
        pixelEllipse(c, '#8b724233', x, y - 9, 28, 22);
        pixelEllipse(c, '#c1884322', x, y - 9, 18, 18);
        rect(c, '#d36542', x - 3, y - 16 - f, 6, 9 + f);
        rect(c, '#f3b65b', x - 2, y - 15 - f, 4, 7 + f);
        rect(c, '#ffe6a0', x - 1, y - 11 - f, 2, 4 + f);
        rect(c, '#d18d48', x - 4, y - 7, 8, 2);
        const lift = (t * 8 + x) % 17;
        rect(c, '#c9955355', x + Math.sin(t * 3 + x) * 3, y - 16 - lift, 1, 1);
      }
      this.drawAttacks(c, m, t);
      const actors = (m.players || []).map((p, i) => {
        const target = { x: OX + p.x * TILE + TILE / 2, y: OY + p.y * TILE + TILE / 2 };
        let pos = this.positions[i];
        if (!pos || Math.hypot(pos.x - target.x, pos.y - target.y) > TILE * 2.2 || p.state === 'dodge') pos = { ...target };
        else if (!m.paused) { const lerp = Math.min(1, dt * 26); pos.x += (target.x - pos.x) * lerp; pos.y += (target.y - pos.y) * lerp; }
        this.positions[i] = pos;
        return { p, pos };
      });
      const sorted = [
        ...actors.map(a => ({ y: a.pos.y, draw: () => drawCharacter(c, a.p, a.pos, a.p.hp <= 0 ? t + (this.deathElapsed || 0) : t, m.attacks || []) })),
        ...OBSTACLES.map(o => ({ y: OY + o.y * TILE + TILE / 2, draw: () => pillar(c, OX + o.x * TILE + 12, OY + o.y * TILE + 12) }))
      ];
      sorted.sort((a, b) => a.y - b.y).forEach(a => a.draw());
      this.drawEffects(c, m, t);
      // Water glints and drifting fireflies stay away from attack indicators.
      for (let i = 0; i < 13; i++) {
        const x = 12 + (i * 83) % 520, y = 10 + (i * 67) % 332;
        if (x > 58 && x < 486 && y > 30 && y < 319) continue;
        const a = .25 + (Math.sin(t * 1.2 + i * 3.5) + 1) * .22;
        c.globalAlpha = a; rect(c, '#bbd59a', x + Math.sin(t * .4 + i) * 5, y + Math.cos(t * .6 + i) * 3, 1, 1);
      }
      c.globalAlpha = 1;
    }
    drawAttacks(c, m, t) {
      for (const a of m.attacks || []) {
        if (t > a.endsAt || (a.startsAt != null && t < a.startsAt)) continue;
        const owner = (a.owner || 0) % 2;
        const color = COLORS[owner], floorColor = owner === 0 ? '#2cbfcf' : '#ff554f';
        const hatchColor = owner === 0 ? '#81ede9' : '#ff8977', impacted = t >= a.impactAt;
        const progress = Math.max(0, Math.min(1, (t - a.startsAt) / (a.impactAt - a.startsAt || .3)));
        for (const cell of a.cells || []) {
          const x = OX + cell.x * TILE, y = OY + cell.y * TILE;
          c.globalAlpha = impacted ? .45 : .2 + .24 * progress;
          rect(c, floorColor, x + 1, y + 1, TILE - 2, TILE - 2);
          c.globalAlpha = impacted ? .8 : .4 + progress * .4;
          // Fill, hatch, corners and symbols all distinguish each player's warning.
          for (const [cx, cy, sx, sy] of [[x+2,y+2,1,1],[x+21,y+2,-1,1],[x+2,y+21,1,-1],[x+21,y+21,-1,-1]]) {
            rect(c, color, cx + (sx < 0 ? -4 : 0), cy, 5, 1);
            rect(c, color, cx, cy + (sy < 0 ? -4 : 0), 1, 5);
          }
          c.globalAlpha = .22;
          for (let h = 0; h < 3; h++) line(c, hatchColor, x + 4 + h * 6, y + 19, x + 10 + h * 6, y + 5);
          c.globalAlpha = .9;
          if (impacted) {
            line(c, '#ffe8bc', x + 3, y + 19, x + 19, y + 4, 2);
            line(c, color, x + 4, y + 22, x + 21, y + 7, 1);
          } else {
            rect(c, '#ffe4a3', x + 4, y + 20, Math.round(16 * progress), 1);
            text(c, a.owner === 0 ? '+' : '×', x + 12, y + 12, color, 7);
          }
          c.globalAlpha = 1;
        }
      }
    }
    drawEffects(c, m, t) {
      for (const e of m.effects || []) {
        const end = e.until ?? e.endsAt ?? ((e.time || 0) + .5);
        if (t > end || t < (e.time || 0)) continue;
        const duration = Math.max(.1, end - (e.time || 0)), progress = Math.max(0, Math.min(1, (t - (e.time || 0)) / duration));
        const x = OX + e.x * TILE + 12, y = OY + e.y * TILE + 8;
        const color = COLORS[(e.player || 0) % 2];
        c.globalAlpha = 1 - progress;
        const kind = String(e.type || '');
        if (/parry|block|counter|blink|dodge/.test(kind)) {
          for (let i = 0; i < 8; i++) {
            const angle = i * Math.PI / 4, radius = 4 + progress * 23;
            rect(c, i % 2 ? '#ffefb3' : color, x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, 2, 2);
          }
          c.strokeStyle = color; c.lineWidth = 1; c.strokeRect(Math.round(x - 8 - progress * 9), Math.round(y - 8 - progress * 9), Math.round(16 + progress * 18), Math.round(16 + progress * 18));
        } else if (/hit|damage|slash/.test(kind)) {
          for (let i = 0; i < 6; i++) { const a = i * 1.05 + .3, r = 3 + progress * 13; rect(c, '#ffe5ad', x + Math.cos(a) * r, y + Math.sin(a) * r, 2, 1); }
        }
        if (e.text) {
          const Chinese = /[^\x00-\x7F]/.test(e.text);
          c.font = Chinese ? 'bold 8px sans-serif' : 'bold 9px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillStyle = '#13282b'; c.fillText(e.text, Math.round(x+1), Math.round(y - 24 - progress * 13 + 1));
          c.fillStyle = /parry|block|counter/.test(kind) ? '#ffe4a0' : '#f9e6cb'; c.fillText(e.text, Math.round(x), Math.round(y - 24 - progress * 13));
        }
        c.globalAlpha = 1;
      }
    }
  }
  window.DuelRenderer = DuelRenderer;
})();
