/* ============================================================
   spice.js — three layers of desert ambience
     back  (#spice-back): dunes, scattered star twinkles, motes
     mid   (#spice):      cursor dust, dwell piles, saguaro trees
     front (DOM):         the page's own text and buttons
   Collision rules:
     across layers — the deeper element blurs and fades when it
       comes within 10px of something on a nearer layer;
     tree vs tree  — the older tree dissolves early;
     dune vs dune  — the farther ridge line stops where it passes
       behind a nearer one;
     star vs star  — a newcomer too close to a neighbour doubles
       the neighbour instead of spawning.
   ============================================================ */

(() => {
  "use strict";

  const midCanvas = document.getElementById("spice");
  const backCanvas = document.getElementById("spice-back");
  if (!midCanvas || !backCanvas) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduceMotion.matches) {
    midCanvas.remove();
    backCanvas.remove();
    return;
  }

  const ctx = midCanvas.getContext("2d");
  const bctx = backCanvas.getContext("2d");

  /* ---------- palettes ---------- */

  const PALETTES = {
    light: {
      dust: ["#b4561f", "#c96b2a", "#8a4a1f", "#d98e4a", "#6e3d1b", "#c05a1e"],
      glint: "#e8934a",
      branch: "#5d3d24",
      leaf: "#b4ff4b",
      dune: "#7d6b3e",
      mote: "rgba(140, 90, 45,",
      particleComposite: "source-over"
    },
    dark: {
      dust: ["#e08a41", "#f0a45c", "#c2691f", "#f7c98a", "#a3521c", "#ffb36b"],
      glint: "#ffe0b0",
      branch: "#d98a45",
      leaf: "#a7e14e",
      dune: "#8a744a",
      mote: "rgba(240, 180, 110,",
      particleComposite: "lighter"
    }
  };

  const darkMq = window.matchMedia("(prefers-color-scheme: dark)");
  let pal = PALETTES.light;
  // honour the site's own theme override (index.html writes data-theme)
  // before falling back to the OS preference
  function computePal() {
    const forced = document.documentElement.dataset.theme;
    const dark = forced === "dark" || (forced !== "light" && darkMq.matches);
    pal = dark ? PALETTES.dark : PALETTES.light;
  }
  computePal();
  if (darkMq.addEventListener) darkMq.addEventListener("change", computePal);
  else darkMq.addListener(computePal);
  new MutationObserver(computePal)
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  /* ---------- sizing ---------- */

  let W = 0, H = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    for (const [cv, c] of [[midCanvas, ctx], [backCanvas, bctx]]) {
      cv.width = W * dpr;
      cv.height = H * dpr;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }
  resize();

  /* ---------- helpers ---------- */

  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const gauss = () => (Math.random() + Math.random() + Math.random()) / 1.5 - 1;
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const easeOut = (p) => p * (2 - p);

  function rectsOverlap(a, b, pad) {
    return a.left < b.right + pad && a.right > b.left - pad &&
           a.top < b.bottom + pad && a.bottom > b.top - pad;
  }

  // each dimmable thing carries a .dim that eases toward 0 or 1,
  // driving the cross-layer blur-and-fade rule
  function easeDim(obj, near, dt) {
    const target = near ? 1 : 0;
    obj.dim += (target - obj.dim) * Math.min(1, dt * 6);
    if (!near && obj.dim < 0.02) obj.dim = 0;
    return obj.dim;
  }

  /* ---------- keep-clear zones around the page's text and UI ---------- */

  let uiRects = [];
  let rectTimer = 0;

  function refreshRects() {
    uiRects = [];
    const els = document.querySelectorAll("main h1, main p, main a, main .themes");
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      uiRects.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
  }
  refreshRects();

  function boxNearUI(box, pad) {
    for (const r of uiRects) {
      if (box.left < r.right + pad && box.right > r.left - pad &&
          box.top < r.bottom + pad && box.bottom > r.top - pad) return true;
    }
    return false;
  }

  function pointNearUI(x, y, pad) {
    for (const r of uiRects) {
      if (x > r.left - pad && x < r.right + pad &&
          y > r.top - pad && y < r.bottom + pad) return true;
    }
    return false;
  }

  /* ---------- tuning ---------- */

  const MAX_PARTICLES = 420;
  const MAX_TREES = 5;
  const DWELL_RADIUS = 30;      // px the cursor may wander while "holding"
  const PILE_DELAY = 380;       // ms of stillness before dust starts piling
  const SEED_DELAY = 1800;      // ms of stillness before the pile seeds a tree
  const DISSOLVE_MS = 3200;     // tree crumble duration
  const PILE_DISPERSE_MS = 1500;
  const LAYER_PAD = 10;         // cross-layer proximity that triggers dim/blur

  /* ---------- particles (mid layer: the cursor's dust) ---------- */

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

      // mid layer yields to the front layer: dust fades near text
      if (pointNearUI(p.x, p.y, LAYER_PAD)) a *= 0.35;

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

  /* ---------- ambient motes (back layer, barely-there drift) ---------- */

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
      bctx.fillStyle = pal.mote + a + ")";
      bctx.beginPath();
      bctx.arc(m.x, m.y, m.size, 0, TAU);
      bctx.fill();
    }
  }

  /* ---------- dunes (back layer: fading ridge lines) ---------- */

  const DUNE_CYCLE = 15000;   // a touch brisker than the original 20s breath
  const DUNES_PER_SIDE = 3;
  const dunes = [];

  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < DUNES_PER_SIDE; i++) {
      dunes.push({
        side,
        t0: performance.now() - rand(0, DUNE_CYCLE),
        active: false,
        fade: 0,
        dim: 0
      });
    }
  }

  function ridgeRise(d, t) {
    return t < d.peakT
      ? Math.pow(t / d.peakT, 1.7)
      : Math.pow((1 - t) / (1 - d.peakT), 1.35);
  }

  function makeRidge(d) {
    const N = 30;
    d.pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      d.pts.push(d.x + t * d.w, d.y - d.h * ridgeRise(d, t));
    }
  }

  // height of dune d's surface at x; Infinity outside its span
  function ridgeYat(d, x) {
    const t = (x - d.x) / d.w;
    if (t <= 0 || t >= 1) return Infinity;
    return d.y - d.h * ridgeRise(d, t);
  }

  function placeDune(d) {
    d.active = false;
    if (W < 760) return; // no side room on small screens
    const bandL = d.side === 0 ? W * 0.02 : W * 0.67;
    const bandR = d.side === 0 ? W * 0.33 : W * 0.98;
    for (let attempt = 0; attempt < 16; attempt++) {
      const w = rand(120, Math.min(300, W * 0.24));
      if (bandR - bandL <= w) continue;
      let x, y;
      // dunes like company: sometimes settle overlapping a neighbour,
      // which is what the behind-one-another occlusion is for
      const mates = dunes.filter((o) => o !== d && o.active && o.side === d.side);
      if (mates.length && Math.random() < 0.45) {
        const m = pick(mates);
        x = m.x + rand(-0.65, 0.65) * m.w;
        y = m.y + rand(-6, 12);
        if (x < bandL || x + w > bandR || y > H * 0.94 || y < H * 0.1 + 30) continue;
      } else {
        x = rand(bandL, bandR - w);
        y = rand(H * 0.10 + 30, H * 0.94);
      }
      const h = rand(12, 30);
      const box = { left: x, right: x + w, top: y - h, bottom: y + 3 };
      if (boxNearUI(box, 18)) continue;
      d.x = x; d.y = y; d.w = w; d.h = h;
      d.peakT = rand(0.45, 0.72);
      d.box = box;
      makeRidge(d);
      d.active = true;
      return;
    }
  }

  function updateAndDrawDunes(dt, now) {
    // advance every fade clock first so occlusion sees current values
    for (const d of dunes) {
      let u = (now - d.t0) / DUNE_CYCLE;
      if (u >= 1) {
        // keep each dune's own phase, even after a long tab-hidden pause —
        // resetting to zero would leave the whole field breathing in unison
        d.t0 = now - ((now - d.t0) % DUNE_CYCLE);
        u = (now - d.t0) / DUNE_CYCLE;
        placeDune(d); // drift somewhere new for the next breath
      }
      if (!d.active && u < 0.03) placeDune(d);
      d.fade = d.active ? Math.pow(Math.sin(Math.PI * u), 1.5) : 0;
    }

    for (const d of dunes) {
      if (!d.active || d.fade <= 0.015) continue;

      // back layer yields to mid and front layers
      const near = boxNearUI(d.box, LAYER_PAD) ||
        trees.some((tr) => tr.state !== "dissolving" && rectsOverlap(d.box, tr.bbox, LAYER_PAD));
      const dim = easeDim(d, near, dt);
      const alpha = 0.5 * d.fade * (1 - 0.55 * dim);
      if (alpha <= 0.012) continue;

      bctx.filter = dim > 0.04 ? "blur(" + (dim * 2.2).toFixed(2) + "px)" : "none";
      bctx.strokeStyle = pal.dune;
      bctx.lineWidth = 2.6;
      bctx.lineCap = "round";
      bctx.lineJoin = "round";

      // draw the ridge in runs, cutting the line where it passes behind a
      // nearer (lower-baseline) dune — the intersection point ends the run
      let run = [];
      let runAlpha = 0;
      const flush = () => {
        if (run.length >= 4) {
          bctx.globalAlpha = runAlpha;
          bctx.beginPath();
          bctx.moveTo(run[0], run[1]);
          for (let k = 2; k < run.length; k += 2) bctx.lineTo(run[k], run[k + 1]);
          bctx.stroke();
        }
        run = [];
      };

      for (let i = 0; i < d.pts.length; i += 2) {
        const px = d.pts[i], py = d.pts[i + 1];
        let occ = 0;
        for (const o of dunes) {
          if (o === d || !o.active || o.fade <= 0.03) continue;
          if (o.y <= d.y) continue; // only nearer dunes occlude
          if (py > ridgeYat(o, px) - 1.2) occ = Math.max(occ, Math.min(1, o.fade * 1.4));
        }
        const aHere = alpha * (1 - occ);
        if (aHere <= 0.012) { flush(); continue; }
        if (!run.length) {
          runAlpha = aHere;
          run.push(px, py);
        } else if (Math.abs(aHere - runAlpha) > 0.025) {
          run.push(px, py);
          flush();
          runAlpha = aHere;
          run.push(px, py);
        } else {
          run.push(px, py);
        }
      }
      flush();
      bctx.filter = "none";
    }
    bctx.globalAlpha = 1;
  }

  /* ---------- star twinkles (back layer, scattered) ---------- */

  const twinkles = [];
  const TWINKLE_MAX = 18;
  let twinkleTimer = rand(0.3, 1.0);

  function spawnTwinkle(now) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = rand(W * 0.04, W * 0.96);
      const y = rand(H * 0.05, H * 0.95);
      if (pointNearUI(x, y, 16)) continue;
      let inTree = false;
      for (const tr of trees) {
        if (x > tr.bbox.left - 12 && x < tr.bbox.right + 12 &&
            y > tr.bbox.top - 12 && y < tr.bbox.bottom + 12) { inTree = true; break; }
      }
      if (inTree) continue;
      // a newcomer landing within 1.5 radii of a neighbour doubles the
      // neighbour instead of crowding it
      for (const s of twinkles) {
        if (Math.hypot(x - s.x, y - s.y) < s.size * 2.2 * 1.5) {
          s.size = Math.min(s.size * 2, 7);
          return;
        }
      }
      twinkles.push({
        x, y,
        size: rand(1.4, 3),
        born: now,
        ttl: rand(4200, 9000),
        tw: rand(0, TAU),
        sp: rand(0.7, 1.6),
        dim: 0
      });
      return;
    }
  }

  function updateAndDrawTwinkles(dt, now) {
    twinkleTimer -= dt;
    if (twinkleTimer <= 0) {
      twinkleTimer = rand(0.35, 1.1);
      if (twinkles.length < TWINKLE_MAX) spawnTwinkle(now);
    }
    for (let i = twinkles.length - 1; i >= 0; i--) {
      const s = twinkles[i];
      const lp = (now - s.born) / s.ttl;
      if (lp >= 1) { twinkles.splice(i, 1); continue; }
      let a = lp < 0.22 ? lp / 0.22 : lp > 0.68 ? (1 - lp) / 0.32 : 1;
      a *= 0.5 + 0.5 * Math.sin(now * 0.0012 * s.sp + s.tw); // slow flicker

      const r = s.size * 2.2;
      const near = pointNearUI(s.x, s.y, LAYER_PAD + r) ||
        trees.some((tr) => tr.state !== "dissolving" &&
          s.x > tr.bbox.left - LAYER_PAD - r && s.x < tr.bbox.right + LAYER_PAD + r &&
          s.y > tr.bbox.top - LAYER_PAD - r && s.y < tr.bbox.bottom + LAYER_PAD + r);
      const dim = easeDim(s, near, dt);
      a *= 1 - 0.55 * dim;

      bctx.filter = dim > 0.04 ? "blur(" + (dim * 2).toFixed(2) + "px)" : "none";
      bctx.globalAlpha = Math.max(0, a * 0.85);
      bctx.strokeStyle = pal.glint;
      bctx.lineWidth = 0.9;
      bctx.beginPath();
      bctx.moveTo(s.x - r, s.y); bctx.lineTo(s.x + r, s.y);
      bctx.moveTo(s.x, s.y - r); bctx.lineTo(s.x, s.y + r);
      bctx.stroke();
      bctx.fillStyle = pal.glint;
      bctx.beginPath();
      bctx.arc(s.x, s.y, s.size * 0.5, 0, TAU);
      bctx.fill();
      bctx.filter = "none";
    }
    bctx.globalAlpha = 1;
  }

  /* ---------- piles (mid layer) ---------- */

  const piles = [];

  function makePile(x, y) {
    const pile = { x, y, grains: [], acc: 0, state: "building", disperseAt: 0, dim: 0 };
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

      const box = { left: pile.x - 24, right: pile.x + 24, top: pile.y - 20, bottom: pile.y + 8 };
      const dim = easeDim(pile, boxNearUI(box, LAYER_PAD), dt);
      alpha *= 1 - 0.55 * dim;

      ctx.filter = dim > 0.04 ? "blur(" + (dim * 2).toFixed(2) + "px)" : "none";
      ctx.globalAlpha = alpha;
      for (const g of pile.grains) {
        ctx.fillStyle = g.color;
        ctx.fillRect(pile.x + g.dx - g.s / 2, pile.y + g.dy - g.s / 2, g.s, g.s);
      }
      ctx.filter = "none";
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- saguaro trees (mid layer) ----------
     Every limb follows the same rule the reference draws: run straight
     out at 90° from the parent line, round the corner smoothly, then
     climb parallel to the parent. Only limbs whose upward run is long
     enough earn a green tip; short stubs stay bare. */

  const trees = [];
  const LEAF_MIN_V = 20;    // px of upward run a limb needs to leaf out

  // point at arclength s along a limb's out-corner-up path (before sway)
  function limbPoint(l, s) {
    if (s <= l.hRun) return [l.ax + l.side * s, l.ay];
    s -= l.hRun;
    if (l.arc > 0 && s <= l.arc) {
      const phi = s / l.r;
      const cx = l.ax + l.side * l.hRun;
      const cy = l.ay - l.r;
      return [cx + l.side * l.r * Math.sin(phi), cy + l.r * Math.cos(phi)];
    }
    s -= l.arc;
    return [l.ax + l.side * (l.hRun + l.r), l.ay - l.r - s];
  }

  function strokeLimbSpan(l, sA, sB, cosA, sinA, color, alpha) {
    if (sB - sA < 0.6) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = l.w;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    const steps = Math.max(2, Math.ceil((sB - sA) / 2.5));
    for (let i = 0; i <= steps; i++) {
      const s = sA + ((sB - sA) * i) / steps;
      const p = limbPoint(l, s);
      const dx = p[0] - l.ax, dy = p[1] - l.ay;
      ctx[i === 0 ? "moveTo" : "lineTo"](
        l.ax + dx * cosA - dy * sinA,
        l.ay + dx * sinA + dy * cosA
      );
    }
    ctx.stroke();
  }

  function buildTree(x, y, pile) {
    const scale = rand(0.9, 1.25);
    const limbs = [];

    function addLimb(l) {
      l.arc = l.r * Math.PI / 2;
      l.total = l.hRun + l.arc + l.vRun;
      l.dur = 260 + l.total * 6;
      l.leafLen = Math.min(rand(9, 14), l.vRun * 0.7);
      l.hasLeaf = l.vRun >= LEAF_MIN_V;
      l.swAmp = rand(0.004, 0.011);
      l.swPh = rand(0, TAU);
      l.x1 = l.ax; l.y1 = l.ay;
      l.p = 0;
      limbs.push(l);
      return l;
    }

    // trunk: one straight vertical line
    const trunkV = rand(60, 92) * scale;
    const trunk = addLimb({
      ax: x, ay: y, side: 0, hRun: 0, r: 0, vRun: trunkV,
      start: 0, w: 4.2 * scale
    });

    // arms sprout at spaced heights, mostly alternating sides
    const nArms = 2 + ((Math.random() * 3) | 0);
    let side = Math.random() < 0.5 ? 1 : -1;
    const heights = [];
    for (let i = 0; i < nArms; i++) heights.push(rand(trunkV * 0.22, trunkV * 0.8));
    heights.sort((a, b) => a - b);
    for (let i = 1; i < heights.length; i++) {
      if (heights[i] - heights[i - 1] < 9) heights[i] = heights[i - 1] + 9;
    }

    for (const h of heights) {
      if (h > trunkV * 0.85) continue;
      const ay = y - h;
      const hRun = rand(3, 12) * scale;
      const r = rand(6, 13) * scale;
      // arms usually crest just shy of the trunk top
      const vCap = Math.max(4, ay - r - (y - trunkV) + rand(-14, 10));
      let vRun = Math.min(vCap, rand(14, 60) * scale);
      if (Math.random() < 0.25) vRun = rand(3, 9); // the odd bare stub
      const arm = addLimb({
        ax: x, ay, side, hRun, r, vRun,
        start: trunk.dur * (h / trunkV) + rand(80, 260),
        w: 3.6 * scale
      });

      // occasionally an arm grows its own smaller arm off its upward run
      if (arm.vRun > 26 && Math.random() < 0.2) {
        const sh = rand(arm.vRun * 0.25, arm.vRun * 0.6);
        addLimb({
          ax: arm.ax + arm.side * (arm.hRun + arm.r),
          ay: arm.ay - arm.r - sh,
          side: -arm.side,
          hRun: rand(3, 9) * scale,
          r: rand(5, 9) * scale,
          vRun: rand(8, Math.max(10, sh + 6)),
          start: arm.start + arm.dur * ((arm.hRun + arm.arc + sh) / arm.total) + rand(80, 200),
          w: 3.1 * scale
        });
      }
      side = Math.random() < 0.82 ? -side : side;
    }

    // final footprint (ignoring sway), used for all collision checks
    let minX = x, maxX = x, minY = y - trunkV;
    for (const l of limbs) {
      const tipX = l.ax + l.side * (l.hRun + l.r);
      minX = Math.min(minX, l.ax, tipX);
      maxX = Math.max(maxX, l.ax, tipX);
      minY = Math.min(minY, l.ay - l.r - l.vRun);
    }

    let growTotal = 0;
    for (const l of limbs) growTotal = Math.max(growTotal, l.start + l.dur);

    return {
      x, y, limbs, growTotal, pile,
      bbox: { left: minX - 5, right: maxX + 5, top: minY - 5, bottom: y + 5 },
      born: performance.now(),
      ttl: rand(15000, 26000),
      state: "growing",
      dissolveStart: 0,
      phase: rand(0, TAU),
      dim: 0
    };
  }

  function seedTree(x, y, pile) {
    const tree = buildTree(x, y, pile);
    // a newcomer claims its ground: overlapping elders dissolve early
    for (const other of trees) {
      if (other.state !== "dissolving" && rectsOverlap(tree.bbox, other.bbox, 0)) {
        startDissolve(other);
      }
    }
    const standing = trees.filter((t) => t.state !== "dissolving");
    if (standing.length >= MAX_TREES) startDissolve(standing[0]);
    trees.push(tree);
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
          const l = pick(tree.limbs);
          if (l.p > 0.2) spawnDust(l.x1, l.y1, { g: -10, vy: -10, glintChance: 0.12, scale: 0.85 });
        }
      } else {
        growClock = now - tree.born;
      }

      // mid layer yields to the front layer
      const dim = easeDim(tree, boxNearUI(tree.bbox, LAYER_PAD), dt);
      alpha *= 1 - 0.5 * dim;
      ctx.filter = dim > 0.04 ? "blur(" + (dim * 2.5).toFixed(2) + "px)" : "none";

      for (const l of tree.limbs) {
        const p = clamp01((growClock - l.start) / l.dur);
        l.p = p;
        if (p <= 0) { l.x1 = l.ax; l.y1 = l.ay; continue; }
        const s = l.total * easeOut(p);

        const rot = Math.sin(t * 0.8 + tree.phase + l.swPh) * l.swAmp;
        const cosA = Math.cos(rot), sinA = Math.sin(rot);

        const leafStart = l.hasLeaf ? l.total - l.leafLen : Infinity;
        strokeLimbSpan(l, 0, Math.min(s, leafStart), cosA, sinA, pal.branch, alpha * 0.92);
        if (s > leafStart) {
          strokeLimbSpan(l, Math.max(0, leafStart - 1), s, cosA, sinA, pal.leaf, alpha * 0.95);
        }

        const tip = limbPoint(l, s);
        const dx = tip[0] - l.ax, dy = tip[1] - l.ay;
        l.x1 = l.ax + dx * cosA - dy * sinA;
        l.y1 = l.ay + dx * sinA + dy * cosA;
      }
      ctx.filter = "none";
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

  /* ---------- resize (debounced so dunes don't thrash mid-drag) ---------- */

  let settleTimer = 0;
  window.addEventListener("resize", () => {
    resize();
    refreshRects();
    // dunes hold their ground during the drag (the dim rule hides any
    // momentary overlap) and settle into new spots once the window rests
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      refreshRects();
      for (const d of dunes) placeDune(d);
    }, 250);
  });

  // seed the field right away so the first breaths don't wait a full cycle
  window.addEventListener("load", () => {
    refreshRects();
    for (const d of dunes) placeDune(d);
  });

  /* ---------- main loop ---------- */

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;

    ctx.clearRect(0, 0, W, H);
    bctx.clearRect(0, 0, W, H);

    // entrance animations and font loading shift the text early on,
    // so the keep-clear zones are re-measured on a slow tick
    rectTimer -= dt;
    if (rectTimer <= 0) { rectTimer = 2; refreshRects(); }

    updateDwell(dt, now);

    // back layer
    updateAndDrawDunes(dt, now);
    updateAndDrawMotes(dt, now);
    updateAndDrawTwinkles(dt, now);

    // mid layer
    updateAndDrawPiles(dt, now);
    updateAndDrawTrees(dt, now);
    updateAndDrawParticles(dt, now);
  }
  requestAnimationFrame(frame);
})();
