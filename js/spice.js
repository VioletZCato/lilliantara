/* ============================================================
   spice.js — cursor dust, dwell piles, lineage trees
   The cursor sheds orange-cinnamon dust. Hold still and it
   piles up; hold longer and the pile seeds a phylogenetic
   tree, which grows, sways, and eventually crumbles back
   into dust.
   ============================================================ */

(() => {
  "use strict";

  const canvas = document.getElementById("spice");
  if (!canvas) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduceMotion.matches) {
    canvas.remove();
    return;
  }

  const ctx = canvas.getContext("2d");

  /* ---------- palettes ---------- */

  const PALETTES = {
    light: {
      dust: ["#b4561f", "#c96b2a", "#8a4a1f", "#d98e4a", "#6e3d1b", "#c05a1e"],
      glint: "#e8934a",
      branch: "#5d3d24",
      branchTip: "#a35622",
      node: "#b4561f",
      mote: "rgba(140, 90, 45,",
      particleComposite: "source-over"
    },
    dark: {
      dust: ["#e08a41", "#f0a45c", "#c2691f", "#f7c98a", "#a3521c", "#ffb36b"],
      glint: "#ffe0b0",
      branch: "#d98a45",
      branchTip: "#f2b06a",
      node: "#f7c081",
      mote: "rgba(240, 180, 110,",
      particleComposite: "lighter"
    }
  };

  const darkMq = window.matchMedia("(prefers-color-scheme: dark)");
  let pal = darkMq.matches ? PALETTES.dark : PALETTES.light;
  const onScheme = () => { pal = darkMq.matches ? PALETTES.dark : PALETTES.light; };
  if (darkMq.addEventListener) darkMq.addEventListener("change", onScheme);
  else darkMq.addListener(onScheme);

  /* ---------- sizing ---------- */

  let W = 0, H = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  /* ---------- helpers ---------- */

  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const gauss = () => (Math.random() + Math.random() + Math.random()) / 1.5 - 1;
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  /* ---------- tuning ---------- */

  const MAX_PARTICLES = 420;
  const MAX_TREES = 5;
  const DWELL_RADIUS = 30;      // px the cursor may wander while "holding"
  const PILE_DELAY = 380;       // ms of stillness before dust starts piling
  const SEED_DELAY = 1800;      // ms of stillness before the pile seeds a tree
  const DISSOLVE_MS = 3200;     // tree crumble duration
  const PILE_DISPERSE_MS = 1500;

  /* ---------- particles ---------- */

  const particles = [];

  function spawnDust(x, y, o) {
    o = o || {};
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push({
      x: x + gauss() * 3,
      y: y + gauss() * 3,
      vx: (o.vx || 0) + gauss() * 14,
      vy: (o.vy || 0) + gauss() * 12 - 6,
      g: o.g !== undefined ? o.g : 26,
      size: rand(0.6, 2.1) * (o.scale || 1),
      life: 0,
      ttl: rand(0.6, 1.6),
      color: pick(pal.dust),
      glint: Math.random() < (o.glintChance !== undefined ? o.glintChance : 0.08),
      tw: rand(0, TAU)
    });
  }

  function updateAndDrawParticles(dt, now) {
    ctx.globalCompositeOperation = pal.particleComposite;
    const drag = Math.pow(0.9, dt * 60);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.ttl) { particles.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const lp = p.life / p.ttl;
      let a = lp < 0.15 ? lp / 0.15 : 1 - (lp - 0.15) / 0.85;

      if (p.glint) {
        a *= 0.55 + 0.45 * Math.sin(now * 0.02 + p.tw);
        const s = p.size * 2.4;
        ctx.globalAlpha = Math.max(0, a);
        ctx.strokeStyle = pal.glint;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(p.x - s, p.y); ctx.lineTo(p.x + s, p.y);
        ctx.moveTo(p.x, p.y - s); ctx.lineTo(p.x, p.y + s);
        ctx.stroke();
      } else {
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /* ---------- ambient motes (barely-there drift) ---------- */

  const motes = [];
  for (let i = 0; i < 12; i++) {
    motes.push({
      x: Math.random() * 2000,
      y: Math.random() * 1500,
      vx: rand(-4, 4),
      vy: rand(-2.5, 1.5),
      size: rand(0.7, 1.5),
      tw: rand(0, TAU),
      sp: rand(0.4, 1.1)
    });
  }

  function updateAndDrawMotes(dt, now) {
    for (const m of motes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.x < -10) m.x = W + 10; else if (m.x > W + 10) m.x = -10;
      if (m.y < -10) m.y = H + 10; else if (m.y > H + 10) m.y = -10;
      const a = 0.05 + 0.07 * (0.5 + 0.5 * Math.sin(now * 0.001 * m.sp + m.tw));
      ctx.fillStyle = pal.mote + a + ")";
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.size, 0, TAU);
      ctx.fill();
    }
  }

  /* ---------- piles ---------- */

  const piles = [];

  function makePile(x, y) {
    const pile = { x, y, grains: [], acc: 0, state: "building", disperseAt: 0 };
    piles.push(pile);
    return pile;
  }

  function addGrain(pile) {
    const n = pile.grains.length;
    const sigma = 7 + Math.sqrt(n) * 0.9;
    const dx = gauss() * sigma;
    const hMax = Math.min(18, 2 + n * 0.08);
    const h = hMax * Math.exp(-(dx * dx) / (2 * sigma * sigma * 0.6)) * rand(0.75, 1.05);
    pile.grains.push({
      dx,
      dy: -h + rand(-0.5, 1.5),
      s: rand(0.9, 1.9),
      color: pick(pal.dust)
    });
  }

  function dispersePile(pile) {
    if (pile.state === "dispersing") return;
    pile.state = "dispersing";
    pile.disperseAt = performance.now();
  }

  function updateAndDrawPiles(dt, now) {
    for (let i = piles.length - 1; i >= 0; i--) {
      const pile = piles[i];
      let alpha = 0.92;

      if (pile.state === "dispersing") {
        const dp = clamp01((now - pile.disperseAt) / PILE_DISPERSE_MS);
        alpha *= 1 - dp;
        // grains lift off as dust
        const k = Math.max(1, Math.floor(pile.grains.length * dt * 2.2));
        for (let j = 0; j < k && pile.grains.length; j++) {
          const g = pile.grains.pop();
          if (Math.random() < 0.35) {
            spawnDust(pile.x + g.dx, pile.y + g.dy, { g: -14, vy: -8, glintChance: 0.05, scale: 0.8 });
          }
        }
        if (!pile.grains.length || dp >= 1) { piles.splice(i, 1); continue; }
      }

      ctx.globalAlpha = alpha;
      for (const g of pile.grains) {
        ctx.fillStyle = g.color;
        ctx.fillRect(pile.x + g.dx - g.s / 2, pile.y + g.dy - g.s / 2, g.s, g.s);
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- lineage trees ---------- */

  const trees = [];

  function buildTree(x, y, pile) {
    const branches = [];
    const maxDepth = 5 + (Math.random() < 0.45 ? 1 : 0);
    const scale = rand(0.85, 1.2);

    function grow(parent, depth, angle, start) {
      const len = depth === 0
        ? rand(30, 40) * scale
        : branches[parent].len * rand(0.66, 0.8);
      const dur = 240 + len * 5;
      const b = {
        parent, depth, len,
        baseAngle: angle,
        curl: gauss() * 0.35,
        start, dur,
        isTip: true,
        x1: x, y1: y
      };
      const idx = branches.push(b) - 1;
      if (depth >= maxDepth) return idx;
      // most lineages bifurcate; some end early (extinct lines)
      if (depth >= 2 && Math.random() < 0.10 + depth * 0.045) return idx;
      b.isTip = false;
      const spread = rand(0.32, 0.5);
      const wobble = gauss() * 0.1;
      const childStart = start + dur * 0.8;
      grow(idx, depth + 1, angle - spread * rand(0.55, 1.15) + wobble, childStart + rand(0, 90));
      grow(idx, depth + 1, angle + spread * rand(0.55, 1.15) + wobble, childStart + rand(0, 90));
      return idx;
    }

    grow(-1, 0, -Math.PI / 2 + gauss() * 0.08, 0);

    let growTotal = 0;
    for (const b of branches) growTotal = Math.max(growTotal, b.start + b.dur);

    return {
      x, y, branches, growTotal, pile,
      born: performance.now(),
      ttl: rand(15000, 26000),
      state: "growing",
      dissolveStart: 0,
      phase: rand(0, TAU),
      swayAmp: rand(0.005, 0.009)
    };
  }

  function seedTree(x, y, pile) {
    // make room: crumble the oldest standing tree
    const standing = trees.filter((t) => t.state !== "dissolving");
    if (standing.length >= MAX_TREES) startDissolve(standing[0]);
    trees.push(buildTree(x, y, pile));
  }

  function startDissolve(tree) {
    if (tree.state === "dissolving") return;
    tree.state = "dissolving";
    tree.dissolveStart = performance.now();
    if (tree.pile) dispersePile(tree.pile);
  }

  function updateAndDrawTrees(dt, now) {
    const t = now * 0.001;

    for (let i = trees.length - 1; i >= 0; i--) {
      const tree = trees[i];

      if (tree.state === "growing" && now - tree.born >= tree.growTotal) tree.state = "alive";
      if (tree.state === "alive" && now - tree.born >= tree.ttl) startDissolve(tree);

      let growClock, alpha = 1;
      if (tree.state === "dissolving") {
        const dp = clamp01((now - tree.dissolveStart) / DISSOLVE_MS);
        if (dp >= 1) { trees.splice(i, 1); continue; }
        // run the growth clock backwards: tips retract first, trunk last
        growClock = tree.growTotal * (1 - dp * dp);
        alpha = 1 - 0.45 * dp;
        // shed dust while crumbling
        if (Math.random() < 0.75) {
          const b = pick(tree.branches);
          if (b.p > 0.2) spawnDust(b.x1, b.y1, { g: -10, vy: -10, glintChance: 0.12, scale: 0.85 });
        }
      } else {
        growClock = now - tree.born;
      }

      for (const b of tree.branches) {
        const sway = Math.sin(t * 0.9 + tree.phase + b.depth * 1.1 + b.baseAngle) * tree.swayAmp * b.depth;
        const angle = b.baseAngle + sway;

        let px, py;
        if (b.parent < 0) { px = tree.x; py = tree.y; }
        else { px = tree.branches[b.parent].x1; py = tree.branches[b.parent].y1; }

        const p = clamp01((growClock - b.start) / b.dur);
        b.p = p;
        if (p <= 0) { b.x1 = px; b.y1 = py; continue; }

        const ex = px + Math.cos(angle) * b.len;
        const ey = py + Math.sin(angle) * b.len;
        const mx = (px + ex) / 2 - Math.sin(angle) * b.curl * b.len * 0.35;
        const my = (py + ey) / 2 + Math.cos(angle) * b.curl * b.len * 0.35;

        // partial quadratic curve (de Casteljau) with ease-out growth
        const e = p * (2 - p);
        const ax = px + (mx - px) * e, ay = py + (my - py) * e;
        const bx = mx + (ex - mx) * e, by = my + (ey - my) * e;
        const qx = ax + (bx - ax) * e, qy = ay + (by - ay) * e;
        b.x1 = qx; b.y1 = qy;

        ctx.strokeStyle = b.depth >= 3 ? pal.branchTip : pal.branch;
        ctx.globalAlpha = alpha * (b.depth === 0 ? 0.95 : 0.85);
        ctx.lineWidth = Math.max(0.6, 3 * Math.pow(0.78, b.depth));
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.quadraticCurveTo(ax, ay, qx, qy);
        ctx.stroke();

        // taxa dots at living tips
        if (b.isTip && p >= 1 && tree.state !== "dissolving") {
          const nodeAge = clamp01((growClock - (b.start + b.dur)) / 350);
          ctx.globalAlpha = alpha * 0.9 * nodeAge;
          ctx.fillStyle = pal.node;
          ctx.beginPath();
          ctx.arc(qx, qy, 1.8 * nodeAge, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- pointer: trail + dwell ---------- */

  const pointer = { x: -1e3, y: -1e3, inside: false };
  let anchor = null;   // { x, y, since, pile, seeded }
  let lastEmit = null;
  let emitAcc = 0;

  function newAnchor(x, y, now) {
    if (anchor && anchor.pile && !anchor.seeded) dispersePile(anchor.pile);
    anchor = { x, y, since: now, pile: null, seeded: false };
  }

  function onPointerMove(e) {
    const x = e.clientX, y = e.clientY;
    const now = performance.now();
    pointer.x = x; pointer.y = y; pointer.inside = true;

    if (!anchor) newAnchor(x, y, now);
    else if (Math.hypot(x - anchor.x, y - anchor.y) > DWELL_RADIUS) newAnchor(x, y, now);

    // shed dust along the path travelled
    if (lastEmit) {
      const dx = x - lastEmit.x, dy = y - lastEmit.y;
      const dist = Math.hypot(dx, dy);
      emitAcc += Math.min(dist, 80) * 0.22;
      let n = 0;
      while (emitAcc >= 1 && n < 6) {
        emitAcc -= 1;
        n++;
        const f = Math.random();
        spawnDust(lastEmit.x + dx * f, lastEmit.y + dy * f, {
          vx: dx * 0.4, vy: dy * 0.4
        });
      }
      if (emitAcc > 3) emitAcc = 3;
    }
    lastEmit = { x, y };
  }

  function onPointerDown(e) {
    const now = performance.now();
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true;
    lastEmit = { x: e.clientX, y: e.clientY };
    // a touch-hold should pile up faster than a hovering mouse
    if (e.pointerType === "touch") {
      newAnchor(e.clientX, e.clientY, now - PILE_DELAY * 0.7);
      for (let i = 0; i < 6; i++) spawnDust(e.clientX, e.clientY, { glintChance: 0.15 });
    }
  }

  function pointerGone() {
    pointer.inside = false;
    lastEmit = null;
    if (anchor && anchor.pile && !anchor.seeded) dispersePile(anchor.pile);
    anchor = null;
  }

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointerup", (e) => { if (e.pointerType === "touch") pointerGone(); }, { passive: true });
  window.addEventListener("pointercancel", pointerGone, { passive: true });
  window.addEventListener("pointerout", (e) => { if (!e.relatedTarget) pointerGone(); });
  window.addEventListener("blur", pointerGone);

  function updateDwell(dt, now) {
    if (!pointer.inside || !anchor) return;
    const held = now - anchor.since;

    // keep a gentle trickle settling around the roots after seeding
    if (anchor.seeded) {
      const pile = anchor.pile;
      if (pile && pile.state === "tree" && pile.grains.length < 210) {
        pile.acc += 12 * dt;
        while (pile.acc >= 1 && pile.grains.length < 210) {
          pile.acc -= 1;
          addGrain(pile);
        }
      }
      return;
    }

    if (held > PILE_DELAY) {
      if (!anchor.pile) anchor.pile = makePile(anchor.x, anchor.y + 8);
      const pile = anchor.pile;
      // grains arrive faster the longer you hold
      const rate = Math.min(110, 26 + (held - PILE_DELAY) * 0.075);
      pile.acc += rate * dt;
      while (pile.acc >= 1 && pile.grains.length < 240) {
        pile.acc -= 1;
        addGrain(pile);
      }
      // a visible trickle falling from the cursor onto the pile
      if (Math.random() < 0.5) {
        spawnDust(anchor.x + gauss() * 4, anchor.y, { g: 70, vy: 14, glintChance: 0.14, scale: 0.8 });
      }
    }

    if (held > SEED_DELAY && anchor.pile && anchor.pile.grains.length > 70) {
      anchor.seeded = true;
      anchor.pile.state = "tree";
      seedTree(anchor.pile.x, anchor.pile.y - 3, anchor.pile);
      // a little celebratory puff as the seed takes
      for (let i = 0; i < 10; i++) {
        spawnDust(anchor.pile.x, anchor.pile.y - 4, { g: -6, vy: -16, glintChance: 0.2, scale: 0.9 });
      }
    }
  }

  /* ---------- main loop ---------- */

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;

    ctx.clearRect(0, 0, W, H);

    updateDwell(dt, now);
    updateAndDrawMotes(dt, now);
    updateAndDrawPiles(dt, now);
    updateAndDrawTrees(dt, now);
    updateAndDrawParticles(dt, now);
  }
  requestAnimationFrame(frame);
})();
