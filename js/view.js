/*
 * view.js - draws one snapshot of the tree as SVG and moves between snapshots with springs.
 *
 * Every node, every edge end, the travelling key (the "ghost") and the node radius are each
 * driven by a spring, written in Apple's response / damping form. A new step only changes the
 * targets, so stepping back, scrubbing, or starting a new operation mid-flight always continues
 * from where things are on screen instead of jumping.
 *
 * Layout: x is the node's in-order rank, y is its depth. A rotation never changes the in-order
 * sequence, so during a rotation nodes only move up or down, like a beam tipping level.
 */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const NIL = -1;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function make(name, attrs, parent) {
    const node = document.createElementNS(NS, name);
    if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  /* response: roughly the seconds it takes to arrive; damping: 1 arrives without overshoot */
  function spring(response, damping) {
    const w = (2 * Math.PI) / response;
    return { k: w * w, c: 2 * damping * w };
  }

  const heightOf = (snap, id) => (id === NIL ? 0 : snap.nodes[id].height);
  const formatBf = (b) => (b > 0 ? '+' + b : b < 0 ? '−' + -b : '0');

  /* balance shows as colour: level is moss, one side heavier is amber, two levels out is ember */
  const toneOf = (bf) => (bf === 0 ? 'level' : Math.abs(bf) === 1 ? 'lean' : 'tip');
  const f2 = (v) => v.toFixed(2);
  const f3 = (v) => v.toFixed(3);

  function stops(grad, list) {
    for (const [o, c, a] of list) make('stop', { offset: o, 'stop-color': c, 'stop-opacity': a }, grad);
  }

  /* the clean drawing paints with CSS only; nothing to define */
  function ensureDefs() {}

  /* a small seeded random source, so a key always gets the same rings and the same leaves */
  function rng(seed) {
    let a = (seed * 2654435761) >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* a closed, slightly wavy circle: one growth ring */
  function wobble(rad, cx, cy, rnd, amt) {
    const n = 16, pts = [];
    const a1 = rnd() * 6.283, a2 = rnd() * 6.283;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = rad * (1 + amt * (0.6 * Math.sin(a * 3 + a1) + 0.4 * Math.sin(a * 5 + a2)));
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    let d = 'M' + f3(pts[0][0]) + ' ' + f3(pts[0][1]);
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      d += 'C' + f3(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + f3(p1[1] + (p2[1] - p0[1]) / 6) + ' ' +
        f3(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + f3(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + f3(p2[0]) + ' ' + f3(p2[1]);
    }
    return d + 'Z';
  }

  /* the rings of a node: one per level of height, the pith a little off centre like a real stump */
  function drawRings(g, key, height) {
    while (g.firstChild) g.firstChild.remove();
    const rnd = rng(Math.abs(key) * 7 + 3);
    const k = Math.max(1, Math.min(height, 7));
    const ox = (rnd() - 0.5) * 0.16, oy = (rnd() - 0.5) * 0.16;
    for (let i = 1; i <= k; i++) {
      const t = i / k;
      const rad = 0.74 * Math.pow(t, 0.82);
      make('path', { class: 'tv-growth', d: wobble(rad, ox * (1 - t), oy * (1 - t), rnd, 0.035 + 0.02 * rnd()), 'vector-effect': 'non-scaling-stroke' }, g);
    }
    make('circle', { class: 'tv-pith', cx: f3(ox), cy: f3(oy), r: 0.05 }, g);
  }

  /* a spray of leaves around a node, in units of the node radius; the outer ones only show on a leaf node */
  function drawLeaves(g, key, up) {
    const rnd = rng(Math.abs(key) * 13 + 5);
    const n = 15;
    for (let j = 0; j < n; j++) {
      const outer = j >= 6;
      const spread = outer ? 2.5 : 3.6;
      const a = (up ? -Math.PI / 2 : Math.PI / 2) + (rnd() - 0.5) * spread;
      const d = (outer ? 0.95 : 0.55) + rnd() * (outer ? 1.05 : 0.6);
      const sz = (outer ? 0.85 : 0.7) + rnd() * 0.75;
      const rot = (a + (rnd() - 0.5) * 1.1) * 180 / Math.PI;
      make('use', {
        href: '#tv-leaf',
        class: 'tv-leaf s' + (j % 4) + (outer ? ' l-out' : ''),
        transform: 'translate(' + f3(Math.cos(a) * d) + ' ' + f3(Math.sin(a) * d) + ') rotate(' + rot.toFixed(1) + ') scale(' + f3(sz) + ')'
      }, g);
    }
  }

  /* a branch as a filled, tapering curve: it leaves the parent sideways and arrives along the growth */
  function branch(px, py, cx, cy, w0, w1) {
    const dx = cx - px, dy = cy - py;
    if (Math.abs(dx) + Math.abs(dy) < 0.5) return null;
    const c1x = px + dx * 0.56, c1y = py + dy * 0.1;
    const c2x = cx - dx * 0.05, c2y = cy - dy * 0.56;
    const N = 12, L = [], Rt = [], mid = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = 1 - t;
      const bx = u * u * u * px + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * cx;
      const by = u * u * u * py + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * cy;
      let tx = 3 * u * u * (c1x - px) + 6 * u * t * (c2x - c1x) + 3 * t * t * (cx - c2x);
      let ty = 3 * u * u * (c1y - py) + 6 * u * t * (c2y - c1y) + 3 * t * t * (cy - c2y);
      const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
      const w = (w0 + (w1 - w0) * (1 - Math.pow(u, 1.6))) / 2;
      L.push([bx - ty * w, by + tx * w]); Rt.push([bx + ty * w, by - tx * w]);
      mid.push([bx, by, -ty, tx, w]);
    }
    let d = 'M' + f2(L[0][0]) + ' ' + f2(L[0][1]);
    for (let i = 1; i <= N; i++) d += 'L' + f2(L[i][0]) + ' ' + f2(L[i][1]);
    for (let i = N; i >= 0; i--) d += 'L' + f2(Rt[i][0]) + ' ' + f2(Rt[i][1]);
    /* the lit edge: the side of the branch that faces up */
    const sgn = mid[N >> 1][3] > 0 ? -1 : 1;
    let h = '';
    for (let i = 1; i < N; i++) {
      const [bx, by, nx, ny, w] = mid[i];
      h += (i === 1 ? 'M' : 'L') + f2(bx + nx * w * 0.5 * sgn) + ' ' + f2(by + ny * w * 0.5 * sgn);
    }
    return { d: d + 'Z', h };
  }

  /* the trunk under the root, flaring where it meets the ground */
  function trunk(x, y, groundY, wTop, wBase) {
    const N = 12, L = [], R = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;                                   // 0 at the ground, 1 at the root
      const yy = groundY + (y - groundY) * t;
      const xx = x + Math.sin(t * Math.PI) * (wTop * 0.25);
      const w = (wBase + (wTop - wBase) * Math.pow(t, 0.7)) * (1 + 0.9 * Math.pow(1 - t, 7)) / 2;
      L.push([xx - w, yy]); R.push([xx + w, yy]);
    }
    let d = 'M' + f2(L[0][0]) + ' ' + f2(L[0][1]);
    for (let i = 1; i <= N; i++) d += 'L' + f2(L[i][0]) + ' ' + f2(L[i][1]);
    for (let i = N; i >= 0; i--) d += 'L' + f2(R[i][0]) + ' ' + f2(R[i][1]);
    let h = '';
    for (let i = 1; i < N; i++) h += (i === 1 ? 'M' : 'L') + f2(L[i][0] + (R[i][0] - L[i][0]) * 0.22) + ' ' + f2(L[i][1]);
    return { d: d + 'Z', h };
  }

  function layout(snap) {
    const pos = new Map();
    const order = [];
    let levels = 0;
    if (snap && snap.root !== NIL) {
      const walk = (id, depth, parent) => {
        if (id === NIL || pos.has(id) || depth > 40) return;
        const nd = snap.nodes[id];
        pos.set(id, null);
        walk(nd.left, depth + 1, id);
        pos.set(id, { rank: order.length, depth, parent });
        order.push(id);
        walk(nd.right, depth + 1, id);
        levels = Math.max(levels, depth + 1);
      };
      walk(snap.root, 0, NIL);
    }
    return { pos, order, n: order.length, levels };
  }

  class TreeView {
    constructor(svg, options) {
      this.svg = svg;
      this.o = Object.assign({
        maxR: 26, minR: 11, maxCol: 96, maxLevel: 104,
        top: 0.12, bottom: 0.06,   // share of the height kept clear above and below
        sorted: false,             // write the keys in order along the bottom
        still: false,              // never animate (the static diagrams)
        grow: 'down',              // 'up' draws it like a real tree: root at the bottom
        trunk: false,              // draw a trunk from the ground to the root
        leaves: false,             // leaves around every node, coloured by balance
        speed: 1,
        onPick: null               // called with a key when a node is pressed
      }, options || {});
      ensureDefs();
      svg.classList.add('tv');
      if (this.o.grow === 'up') svg.classList.add('tv--up');
      this.gLeaves = make('g', { class: 'tv-canopy' }, svg);
      this.gGlow = make('g', { class: 'tv-glow' }, svg);
      this.gEdges = make('g', { class: 'tv-edges' }, svg);
      if (this.o.trunk) {
        this.trunkEl = make('path', { class: 'tv-trunk', d: 'M0 0' }, this.gEdges);
        this.trunkHi = make('path', { class: 'tv-edge-hi tv-trunk-hi', d: 'M0 0' }, this.gEdges);
      }
      this.gOver = make('g', { class: 'tv-over' }, svg);
      this.gNodes = make('g', { class: 'tv-nodes' }, svg);
      this.gSorted = make('g', { class: 'tv-sorted' }, svg);
      this.gTop = make('g', { class: 'tv-top' }, svg);
      if (this.o.sorted) {
        this.sortedLabel = make('text', { class: 'tv-sorted-label', 'text-anchor': 'end', 'dominant-baseline': 'central' }, this.gSorted);
        this.sortedLabel.textContent = 'in order';
      }
      this.nodes = new Map();
      this.edges = new Map();
      this.R = { x: 0, v: 0, t: 0 };
      this.drawnR = -1;
      this.ghost = this.makeGhost();
      this.slot = make('circle', { class: 'tv-slot', r: 10, cx: -99, cy: -99 }, this.gOver);
      this.arc = make('path', { class: 'tv-arc', pathLength: 1, d: 'M0 0' }, this.gOver);
      this.arcHead = make('path', { class: 'tv-arc-head', d: 'M0 0' }, this.gOver);
      this.fly = {
        el: make('text', { class: 'tv-fly', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, this.gTop),
        x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, o: 0, vo: 0, to: 0, active: false
      };
      this.frame = null;
      this.W = 0; this.H = 0; this.geo = null; this.L = null;
      this.raf = 0; this.last = 0;
      this.cache = { speed: -1, springs: null };
      this.tick = this.tick.bind(this);
      if (this.o.onPick) {
        svg.addEventListener('pointerdown', (e) => {
          const g = e.target.closest ? e.target.closest('.tv-node') : null;
          if (g && g.__key !== undefined) this.o.onPick(g.__key);
        });
      }
      this.ro = new ResizeObserver(() => this.measure());
      this.ro.observe(svg);
      this.measure();
    }

    get still() { return this.o.still || reduceMotion.matches; }
    setSpeed(s) { this.o.speed = s; }

    springs() {
      if (this.cache.speed !== this.o.speed) {
        const f = Math.pow(this.o.speed, -0.6);
        this.cache.speed = this.o.speed;
        this.cache.springs = {
          move: spring(0.5 * f, 1),       // repositioning: arrive, no overshoot
          rotate: spring(0.68 * f, 0.76), // rotations: momentum, a little swing
          pop: spring(0.46 * f, 0.68),    // a node arriving
          fade: spring(0.3 * f, 1),
          edge: spring(0.42 * f, 1),
          size: spring(0.5, 1)
        };
      }
      return this.cache.springs;
    }

    makeGhost() {
      const g = make('g', { class: 'tv-ghost' }, this.gTop);
      const inner = make('g', { class: 'tv-ghost-inner' }, g);
      const halo = make('circle', { class: 'tv-ghost-halo', r: 10 }, inner);
      const disc = make('circle', { class: 'tv-ghost-disc', r: 10 }, inner);
      const shine = null;
      const txt = make('text', { class: 'tv-ghost-key', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, inner);
      const op = make('text', { class: 'tv-op', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, this.gTop);
      return { g, inner, halo, disc, shine, txt, op, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, o: 0, vo: 0, to: 0, at: NIL, keyVal: null, r: -1 };
    }

    makeNode(id) {
      const halo = make('circle', { class: 'tv-halo', r: 10 }, this.gGlow);
      let leaf = null, sway = null;
      if (this.o.leaves) {
        leaf = make('g', { class: 'tv-leaves' }, this.gLeaves);
        sway = make('g', { class: 'tv-sway' }, leaf);
        sway.style.animationDuration = (4.6 + Math.random() * 3).toFixed(2) + 's';
        sway.style.animationDelay = (-Math.random() * 6).toFixed(2) + 's';
      }
      const g = make('g', { class: 'tv-node' }, this.gNodes);
      const inner = make('g', { class: 'tv-node-inner' }, g);
      const rim = make('circle', { class: 'tv-rim', r: 10 }, inner);
      const wood = make('g', { class: 'tv-wood' }, inner);
      const disc = make('circle', { class: 'tv-disc', r: 1, 'vector-effect': 'non-scaling-stroke' }, wood);
      const rings = make('g', { class: 'tv-rings' }, wood);
      const shine = null;
      const ring = make('circle', { class: 'tv-ring', r: 12 }, inner);
      const key = make('text', { class: 'tv-key', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, inner);
      const badge = make('g', { class: 'tv-badge' }, inner);
      const bInner = make('g', { class: 'tv-badge-inner' }, badge);
      const bDisc = make('circle', { r: 6 }, bInner);
      const bText = make('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central' }, bInner);
      const hb = make('g', { class: 'tv-h' }, inner);
      const hDisc = make('circle', { r: 6 }, hb);
      const hText = make('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central' }, hb);
      const sorted = this.o.sorted ? make('text', { class: 'tv-sorted-key', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, this.gSorted) : null;
      const nd = {
        id, g, inner, halo, disc, rim, shine, ring, key, badge, bText, hText, bDisc, hDisc, hb, sorted, wood, rings, leaf, sway, leafKey: null, ringsAt: '', isLeaf: null,
        x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, s: 0, vs: 0, ts: 1,
        k: null, bf: null, tone: null, h: null, cls: null, mode: 'move', leaving: false, r: -1
      };
      this.nodes.set(id, nd);
      return nd;
    }

    makeEdge(id) {
      const el = make('path', { class: 'tv-edge', d: 'M0 0' }, this.gEdges);
      const hi = make('path', { class: 'tv-edge-hi', d: 'M0 0' }, this.gEdges);
      if (this.trunkHi) this.gEdges.appendChild(this.trunkHi);
      const ed = { id, el, hi, parent: NIL, fx: 0, fy: 0, u: 1, vu: 0, o: 0, vo: 0, to: 1, cls: null, w: -1, vw: 0, tw: 1 };
      this.edges.set(id, ed);
      return ed;
    }

    sizeNode(nd, R) {
      nd.r = R;
      nd.wood.setAttribute('transform', 'scale(' + f3(R) + ')');
      nd.rim.setAttribute('r', (R + Math.max(2.5, R * 0.13)).toFixed(2));
      nd.ring.setAttribute('r', (R + Math.max(6, R * 0.36)).toFixed(2));
      nd.halo.setAttribute('r', (R * 2.6).toFixed(2));
      const big = nd.k !== null && Math.abs(nd.k) >= 100;
      nd.key.setAttribute('font-size', (clamp(R * 0.78, 9, 22) * (big ? 0.8 : 1)).toFixed(2));
      const br = Math.max(7.5, R * 0.43);
      const off = R * 0.76;
      nd.badge.setAttribute('transform', 'translate(' + off.toFixed(2) + ' ' + (-off).toFixed(2) + ')');
      nd.bDisc.setAttribute('r', br.toFixed(2));
      nd.bText.setAttribute('font-size', Math.max(9, br * 1.04).toFixed(2));
      nd.hb.setAttribute('transform', 'translate(' + (-off).toFixed(2) + ' ' + off.toFixed(2) + ')');
      nd.hDisc.setAttribute('r', br.toFixed(2));
      nd.hText.setAttribute('font-size', Math.max(9, br * 1.04).toFixed(2));
    }

    measure() {
      const box = this.svg.getBoundingClientRect();
      const W = Math.round(box.width), H = Math.round(box.height);
      if (!W || !H || (W === this.W && H === this.H)) return;
      this.W = W; this.H = H;
      this.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      if (this.frame) { this.place(false); this.settle(); this.render(); }
    }

    /* frame: { snap, cls, ghost, spawn, pivot, fly, hot, trioEdges, motion } */
    show(frame) {
      this.frame = frame;
      if (!this.W) return;
      const animate = !this.still;
      this.place(animate);
      if (animate) this.start(); else { this.settle(); this.render(); }
    }

    place(animate) {
      const f = this.frame, o = this.o, W = this.W, H = this.H;
      const snap = f.snap;
      const L = layout(snap);
      const n = Math.max(L.n, 1);
      const padX = o.maxR + 14;
      const colW = Math.min(o.maxCol, (W - 2 * padX) / n);
      const r = clamp(colW * 0.37, o.minR, o.maxR);
      const sortedH = o.sorted ? 46 : 0;
      const up = o.grow === 'up';
      const top = H * o.top + r * 1.4;
      const bottom = H * (1 - o.bottom) - r - sortedH;
      const span = Math.max(bottom - top, 0);
      const levels = Math.max(L.levels, 1);
      const levelH = levels > 1 ? Math.min(o.maxLevel, span / (levels - 1)) : Math.min(o.maxLevel, span / 2);
      const treeH = (levels - 1) * levelH;
      /* a real tree keeps its root where it is and grows taller; a diagram is centred */
      const y0 = up ? bottom : top + Math.max(0, (span - treeH) * 0.42);
      const dir = up ? -1 : 1;
      const x0 = W / 2 - (colW * (L.n - 1)) / 2;
      const at = (id) => {
        const p = id === NIL || id === undefined ? null : L.pos.get(id);
        return p ? { x: x0 + p.rank * colW, y: y0 + dir * p.depth * levelH } : null;
      };
      this.rootId = snap ? snap.root : NIL;
      this.geo = { colW, r, levelH, sortedY: H * (1 - o.bottom) - sortedH / 2 + 4 };
      this.L = L;
      this.R.t = r;
      if (!this.R.x || !animate) { this.R.x = r; this.R.v = 0; }

      const cls = f.cls || {};
      const G = this.ghost;
      const rotating = animate && f.motion === 'rotate';
      let piv = null;
      if (rotating && f.pivot) {
        const a = this.nodes.get(f.pivot.a), b = this.nodes.get(f.pivot.b);
        if (a && b) piv = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, cw: (f.pivot.dir === 'right') !== up };
      }

      /* nodes */
      for (const id of L.order) {
        const t = at(id);
        let nd = this.nodes.get(id);
        let fresh = false;
        if (!nd) {
          nd = this.makeNode(id);
          fresh = true;
          if (animate && f.spawn === id && G.o > 0.05) { nd.x = G.x; nd.y = G.y; nd.s = 1; }
          else { nd.x = t.x; nd.y = t.y; nd.s = animate ? (f.stagger ? -0.34 * L.pos.get(id).depth : 0) : 1; }
          nd.tx = t.x; nd.ty = t.y;
        }
        if (nd.leaving && animate && f.spawn === id && G.o > 0.05) { nd.x = G.x; nd.y = G.y; nd.s = 1; }
        nd.leaving = false;
        if (nd.leaf) nd.leaf.classList.remove('is-leaving');
        nd.ts = 1;
        if (piv && !fresh && (Math.abs(t.x - nd.tx) > 0.5 || Math.abs(t.y - nd.ty) > 0.5)) {
          /* a rotation: start each moving node with a push around the pivot, so it swings */
          const rx = nd.x - piv.x, ry = nd.y - piv.y, w = 2.4 * Math.sqrt(o.speed);
          let kx = piv.cw ? -ry * w : ry * w, ky = piv.cw ? rx * w : -rx * w;
          const m = Math.hypot(kx, ky), cap = 820;
          if (m > cap) { kx *= cap / m; ky *= cap / m; }
          nd.vx += kx; nd.vy += ky;
        }
        nd.mode = rotating ? 'rotate' : 'move';
        nd.tx = t.x; nd.ty = t.y;
        const sn = snap.nodes[id];
        if (nd.k !== sn.key) {
          nd.k = sn.key;
          nd.key.textContent = sn.key;
          nd.g.__key = sn.key;
          if (nd.sorted) nd.sorted.textContent = sn.key;
          nd.r = -1;
        }
        const bf = heightOf(snap, sn.left) - heightOf(snap, sn.right);
        if (nd.bf !== bf) {
          nd.bf = bf;
          nd.bText.textContent = formatBf(bf);
          nd.badge.setAttribute('class', 'tv-badge' + (Math.abs(bf) >= 2 ? ' is-warn' : bf === 0 ? ' is-zero' : ''));
          const tone = toneOf(bf);
          if (nd.tone !== tone) {
            nd.tone = tone;
            nd.g.setAttribute('data-tone', tone);
          }
        }
        if (nd.h !== sn.height) { nd.h = sn.height; nd.hText.textContent = sn.height; }
        const rk = sn.key + ':' + sn.height;
        if (nd.leaf) {
          if (nd.leafKey !== sn.key) { nd.leafKey = sn.key; while (nd.sway.firstChild) nd.sway.firstChild.remove(); drawLeaves(nd.sway, sn.key, up); }
          const isLeaf = sn.left === NIL && sn.right === NIL;
          if (nd.isLeaf !== isLeaf) { nd.isLeaf = isLeaf; nd.leaf.classList.toggle('is-inner', !isLeaf); }
          if (nd.leaf.getAttribute('data-tone') !== nd.tone) nd.leaf.setAttribute('data-tone', nd.tone);
        }
        const c = cls[id] || '';
        if (nd.cls !== c) {
          nd.cls = c;
          nd.g.setAttribute('class', 'tv-node' + (c ? ' ' + c : ''));
          nd.halo.setAttribute('class', 'tv-halo' + (c ? ' ' + c : ''));
          if (nd.sorted) nd.sorted.setAttribute('class', 'tv-sorted-key' + (c ? ' ' + c : ''));
        }
      }
      for (const nd of this.nodes.values()) {
        if (!L.pos.has(nd.id)) {
          nd.leaving = true; nd.ts = 0; nd.mode = 'move';
          if (nd.cls !== 'is-leaving') { nd.cls = 'is-leaving'; nd.g.setAttribute('class', 'tv-node is-leaving'); nd.halo.setAttribute('class', 'tv-halo is-leaving'); if (nd.leaf) nd.leaf.classList.add('is-leaving'); }
        }
      }

      /* edges, one per child, named after the child */
      const hot = f.hot || null, trio = f.trioEdges || null;
      for (const id of L.order) {
        const p = L.pos.get(id);
        let ed = this.edges.get(id);
        if (p.parent === NIL) { if (ed) ed.to = 0; continue; }
        const par = this.nodes.get(p.parent);
        if (!ed) {
          ed = this.makeEdge(id);
          ed.parent = p.parent; ed.u = 1; ed.fx = par.x; ed.fy = par.y;
          ed.o = animate ? 0 : 1;
        } else if (ed.parent !== p.parent) {
          /* the parent changed (a rotation): glide from where the end is drawn now */
          const old = this.nodes.get(ed.parent);
          if (old) { ed.fx = ed.fx + (old.x - ed.fx) * ed.u; ed.fy = ed.fy + (old.y - ed.fy) * ed.u; }
          ed.parent = p.parent;
          if (animate) { ed.u = 0; ed.vu = 0; } else ed.u = 1;
        }
        ed.to = 1;
        ed.tw = heightOf(snap, id);
        if (ed.w < 0 || !animate) { ed.w = ed.tw; ed.vw = 0; }
        const c = trio && trio.has(id) ? 'tv-edge is-trio' : hot && hot.has(id) ? 'tv-edge is-hot' : 'tv-edge';
        if (ed.cls !== c) { ed.cls = c; ed.el.setAttribute('class', c); }
      }
      for (const ed of this.edges.values()) if (!L.pos.has(ed.id)) ed.to = 0;

      /* the travelling key */
      const gh = f.ghost;
      if (gh) {
        const ref = at(gh.at);
        const dx = Math.max(colW, r * 2.7);
        let gx = W / 2, gy = y0;
        if (gh.mode === 'start') {
          const root = L.n ? at(snap.root) : null;
          gx = root ? root.x : W / 2;
          gy = root ? root.y - dir * Math.min(levelH * 0.9, r * 3.4) : y0;
        } else if (gh.mode === 'compare' && ref) {
          if (gh.side === 0) { gx = ref.x; gy = ref.y - dir * r * 2.7; }
          else { gx = ref.x + gh.side * dx; gy = ref.y - dir * r * 1.3; }
        } else if (gh.mode === 'merge' && ref) {
          gx = ref.x; gy = ref.y;
        } else if (gh.mode === 'miss') {
          if (ref) { gx = ref.x + gh.side * colW * 0.5; gy = ref.y + dir * Math.max(levelH * 0.9, r * 2.6); }
        }
        /* never let the key leave the stage */
        gy = clamp(gy, r * 0.94 + 14, H - r * 0.94 - 14);
        if (G.o < 0.04 || !animate) { G.x = gx; G.y = gy - (animate ? r * 0.8 : 0); G.vx = 0; G.vy = 0; }
        G.tx = gx; G.ty = gy;
        G.to = gh.mode === 'merge' ? 0 : 1;
        if (!animate) G.o = G.to;
        if (G.keyVal !== gh.key) { G.keyVal = gh.key; G.txt.textContent = gh.key; G.r = -1; }
        G.at = gh.mode === 'compare' && ref ? gh.at : NIL;
        G.op.textContent = gh.mode === 'compare' ? (gh.side === 0 ? '=' : '<') : '';
        G.g.setAttribute('class', 'tv-ghost' + (gh.mode === 'miss' ? ' is-miss' : ''));
        G.inner.classList.remove('is-shake');
        if (gh.shake && animate) { void G.inner.getBoundingClientRect(); G.inner.classList.add('is-shake'); }
        if (gh.mode === 'miss') {
          this.slot.setAttribute('cx', gx.toFixed(1));
          this.slot.setAttribute('cy', gy.toFixed(1));
          this.slot.setAttribute('r', (r * 1.08).toFixed(1));
          this.slot.classList.add('is-on');
        } else this.slot.classList.remove('is-on');
      } else {
        G.to = 0; if (!animate) G.o = 0;
        G.at = NIL; G.op.textContent = '';
        this.slot.classList.remove('is-on');
      }

      /* the rotation arrow around the two nodes that trade places */
      const arcOn = f.pivot && !f.pivot.silent;   // a silent pivot swings the nodes without drawing the arrow
      const pa = arcOn ? at(f.pivot.a) : null, pb = arcOn ? at(f.pivot.b) : null;
      if (pa && pb) {
        const cx = (pa.x + pb.x) / 2, cy = (pa.y + pb.y) / 2;
        const R = Math.hypot(pa.x - pb.x, pa.y - pb.y) / 2 + r * 1.4;
        const cw = f.pivot.dir === 'right';
        const t0 = ((cw ? 152 : 28) * Math.PI) / 180, t1 = ((cw ? 28 : 152) * Math.PI) / 180;
        const fy = up ? -1 : 1;
        const P = (t) => [cx + R * Math.cos(t), cy - fy * R * Math.sin(t)];
        const [ax, ay] = P(t0), [bx, by] = P(t1);
        this.arc.setAttribute('d', 'M' + ax.toFixed(1) + ' ' + ay.toFixed(1) + ' A' + R.toFixed(1) + ' ' + R.toFixed(1) + ' 0 0 ' + (cw === (fy === 1) ? 1 : 0) + ' ' + bx.toFixed(1) + ' ' + by.toFixed(1));
        const ux = cw ? Math.sin(t1) : -Math.sin(t1), uy = fy * (cw ? Math.cos(t1) : -Math.cos(t1));
        const s = Math.max(7, r * 0.44), nx = -uy, ny = ux;
        const tx = bx + ux * s * 0.8, ty = by + uy * s * 0.8, qx = bx - ux * s * 0.5, qy = by - uy * s * 0.5;
        this.arcHead.setAttribute('d', 'M' + tx.toFixed(1) + ' ' + ty.toFixed(1) + ' L' + (qx + nx * s * 0.75).toFixed(1) + ' ' + (qy + ny * s * 0.75).toFixed(1) + ' L' + (qx - nx * s * 0.75).toFixed(1) + ' ' + (qy - ny * s * 0.75).toFixed(1) + 'Z');
        if (animate) {
          this.arc.classList.remove('is-on'); this.arcHead.classList.remove('is-on');
          void this.arc.getBoundingClientRect();
        }
        this.arc.classList.add('is-on'); this.arcHead.classList.add('is-on');
      } else {
        this.arc.classList.remove('is-on'); this.arcHead.classList.remove('is-on');
      }

      /* a key moving from one node to another (delete with two children) */
      const F = this.fly;
      const from = f.fly ? this.nodes.get(f.fly.from) : null, to = f.fly ? at(f.fly.to) : null;
      if (from && to && animate) {
        F.el.textContent = f.fly.key;
        F.x = from.x; F.y = from.y; F.vx = 0; F.vy = 0;
        F.tx = to.x; F.ty = to.y; F.o = 1; F.vo = 0; F.to = 1; F.active = true;
      } else { F.to = 0; F.active = false; if (!animate) F.o = 0; }

      this.svg.classList.toggle('is-empty', L.n === 0);
    }

    /* drop every node and edge at once, so the next frame grows a fresh tree */
    reset() {
      for (const nd of this.nodes.values()) { nd.g.remove(); nd.halo.remove(); if (nd.leaf) nd.leaf.remove(); if (nd.sorted) nd.sorted.remove(); }
      for (const ed of this.edges.values()) { ed.el.remove(); ed.hi.remove(); }
      this.nodes.clear(); this.edges.clear();
      const G = this.ghost; G.o = 0; G.to = 0; G.vo = 0;
    }

    start() {
      if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.tick); }
    }

    tick(now) {
      this.raf = 0;
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (!(dt > 0)) dt = 1 / 60;
      if (dt > 1 / 20) dt = 1 / 20;
      const sp = this.springs();
      const steps = Math.ceil(dt * 240), h = dt / steps;
      for (let i = 0; i < steps; i++) this.integrate(h, sp);
      const busy = this.busy();
      this.render();
      if (busy) this.raf = requestAnimationFrame(this.tick);
      else this.cleanup();
    }

    integrate(h, sp) {
      const R = this.R;
      R.v += (-sp.size.k * (R.x - R.t) - sp.size.c * R.v) * h; R.x += R.v * h;
      for (const nd of this.nodes.values()) {
        const s = nd.mode === 'rotate' ? sp.rotate : sp.move;
        nd.vx += (-s.k * (nd.x - nd.tx) - s.c * nd.vx) * h; nd.x += nd.vx * h;
        nd.vy += (-s.k * (nd.y - nd.ty) - s.c * nd.vy) * h; nd.y += nd.vy * h;
        const p = nd.ts > nd.s ? sp.pop : sp.fade;
        nd.vs += (-p.k * (nd.s - nd.ts) - p.c * nd.vs) * h; nd.s += nd.vs * h;
      }
      for (const ed of this.edges.values()) {
        ed.vu += (-sp.edge.k * (ed.u - 1) - sp.edge.c * ed.vu) * h; ed.u += ed.vu * h;
        ed.vo += (-sp.fade.k * (ed.o - ed.to) - sp.fade.c * ed.vo) * h; ed.o += ed.vo * h;
        ed.vw += (-sp.edge.k * (ed.w - ed.tw) - sp.edge.c * ed.vw) * h; ed.w += ed.vw * h;
      }
      const G = this.ghost, m = sp.move, fd = sp.fade;
      G.vx += (-m.k * (G.x - G.tx) - m.c * G.vx) * h; G.x += G.vx * h;
      G.vy += (-m.k * (G.y - G.ty) - m.c * G.vy) * h; G.y += G.vy * h;
      G.vo += (-fd.k * (G.o - G.to) - fd.c * G.vo) * h; G.o += G.vo * h;
      const F = this.fly;
      if (F.active || F.o > 0.001) {
        F.vx += (-m.k * (F.x - F.tx) - m.c * F.vx) * h; F.x += F.vx * h;
        F.vy += (-m.k * (F.y - F.ty) - m.c * F.vy) * h; F.y += F.vy * h;
        if (F.active && Math.hypot(F.x - F.tx, F.y - F.ty) < 3) { F.active = false; F.to = 0; }
        F.vo += (-fd.k * (F.o - F.to) - fd.c * F.vo) * h; F.o += F.vo * h;
      }
    }

    busy() {
      const e = 0.02;
      const R = this.R;
      if (Math.abs(R.x - R.t) > 0.01 || Math.abs(R.v) > e) return true;
      for (const nd of this.nodes.values()) {
        if (Math.abs(nd.x - nd.tx) > 0.05 || Math.abs(nd.y - nd.ty) > 0.05 || Math.abs(nd.vx) > e || Math.abs(nd.vy) > e) return true;
        if (Math.abs(nd.s - nd.ts) > 0.003 || Math.abs(nd.vs) > e) return true;
      }
      for (const ed of this.edges.values()) if (Math.abs(ed.u - 1) > 0.003 || Math.abs(ed.o - ed.to) > 0.003 || Math.abs(ed.w - ed.tw) > 0.01) return true;
      const G = this.ghost;
      if (Math.abs(G.o - G.to) > 0.003 || (G.o > 0.01 && (Math.abs(G.x - G.tx) > 0.05 || Math.abs(G.y - G.ty) > 0.05))) return true;
      const F = this.fly;
      if (F.active || Math.abs(F.o - F.to) > 0.003) return true;
      return false;
    }

    render() {
      const R = this.R.x;
      const resize = Math.abs(R - this.drawnR) > 0.04;
      if (resize) this.drawnR = R;
      for (const nd of this.nodes.values()) {
        if (resize || nd.r < 0) this.sizeNode(nd, R);
        const s = Math.max(0, nd.s);
        const tf = 'translate(' + nd.x.toFixed(2) + ' ' + nd.y.toFixed(2) + ') scale(' + s.toFixed(3) + ')';
        nd.g.setAttribute('transform', tf);
        nd.halo.setAttribute('transform', tf);
        if (nd.leaf) nd.leaf.setAttribute('transform', 'translate(' + f2(nd.x) + ' ' + f2(nd.y) + ') scale(' + f3(s * R) + ')');
        if (nd.sorted && this.geo) {
          nd.sorted.setAttribute('x', nd.x.toFixed(2));
          nd.sorted.setAttribute('y', this.geo.sortedY.toFixed(2));
          nd.sorted.setAttribute('opacity', clamp(s, 0, 1).toFixed(3));
        }
      }
      if (this.sortedLabel) {
        const first = this.L && this.L.n ? this.nodes.get(this.L.order[0]) : null;
        const x = first ? first.x - Math.max(18, this.geo.colW * 0.6) : -999;
        this.sortedLabel.setAttribute('x', x.toFixed(1));
        this.sortedLabel.setAttribute('y', this.geo ? this.geo.sortedY.toFixed(1) : '0');
        this.sortedLabel.setAttribute('opacity', x > 64 ? '1' : '0');
      }
      for (const ed of this.edges.values()) {
        const ch = this.nodes.get(ed.id);
        if (!ch) continue;
        const par = this.nodes.get(ed.parent);
        const px = par ? ed.fx + (par.x - ed.fx) * ed.u : ed.fx;
        const py = par ? ed.fy + (par.y - ed.fy) * ed.u : ed.fy;
        ed.el.setAttribute('d', 'M' + f2(px) + ' ' + f2(py) + 'L' + f2(ch.x) + ' ' + f2(ch.y));
        const op = (clamp(ed.o, 0, 1) * clamp(ch.s, 0, 1)).toFixed(3);
        ed.el.setAttribute('opacity', op);
      }
      if (this.trunkEl) {
        const root = this.rootId !== undefined && this.rootId !== NIL ? this.nodes.get(this.rootId) : null;
        if (root && !root.leaving) {
          const hr = root.h || 1;
          const wTop = clamp(R * (0.1 + 0.075 * (hr + 1)), 2, R * 0.75) * 1.05;
          const tk = trunk(root.x, root.y, this.H + 6, wTop, wTop * 1.55);
          this.trunkEl.setAttribute('d', tk.d); this.trunkHi.setAttribute('d', tk.h);
          this.trunkHi.setAttribute('stroke-width', f2(Math.max(0.8, wTop * 0.16)));
          const op = clamp(root.s, 0, 1).toFixed(3);
          this.trunkEl.setAttribute('opacity', op); this.trunkHi.setAttribute('opacity', op);
        } else { this.trunkEl.setAttribute('opacity', '0'); this.trunkHi.setAttribute('opacity', '0'); }
      }
      const G = this.ghost;
      if (resize || G.r < 0) {
        G.r = R;
        G.disc.setAttribute('r', (R * 0.94).toFixed(2));
        G.halo.setAttribute('r', (R * 2.2).toFixed(2));
        const big = G.keyVal !== null && Math.abs(G.keyVal) >= 100;
        G.txt.setAttribute('font-size', (clamp(R * 0.8, 10, 21) * (big ? 0.8 : 1)).toFixed(2));
        G.op.setAttribute('font-size', clamp(R * 0.9, 12, 24).toFixed(2));
        this.fly.el.setAttribute('font-size', clamp(R * 0.95, 12, 24).toFixed(2));
      }
      const go = clamp(G.o, 0, 1);
      G.g.setAttribute('transform', 'translate(' + G.x.toFixed(2) + ' ' + G.y.toFixed(2) + ')');
      G.g.setAttribute('opacity', go.toFixed(3));
      const ref = G.at !== NIL ? this.nodes.get(G.at) : null;
      if (ref && G.op.textContent) {
        G.op.setAttribute('x', ((G.x + ref.x) / 2).toFixed(2));
        G.op.setAttribute('y', ((G.y + ref.y) / 2).toFixed(2));
        G.op.setAttribute('opacity', go.toFixed(3));
      } else G.op.setAttribute('opacity', '0');
      const F = this.fly;
      F.el.setAttribute('x', F.x.toFixed(2)); F.el.setAttribute('y', F.y.toFixed(2));
      F.el.setAttribute('opacity', clamp(F.o, 0, 1).toFixed(3));
    }

    settle() {
      this.R.x = this.R.t; this.R.v = 0;
      for (const nd of this.nodes.values()) { nd.x = nd.tx; nd.y = nd.ty; nd.vx = 0; nd.vy = 0; nd.s = nd.ts; nd.vs = 0; }
      for (const ed of this.edges.values()) { ed.u = 1; ed.vu = 0; ed.o = ed.to; ed.vo = 0; ed.w = ed.tw; ed.vw = 0; }
      const G = this.ghost;
      G.x = G.tx; G.y = G.ty; G.vx = 0; G.vy = 0; G.o = G.to; G.vo = 0;
      const F = this.fly;
      F.o = 0; F.to = 0; F.vo = 0; F.active = false;
      this.cleanup();
    }

    cleanup() {
      for (const nd of [...this.nodes.values()]) {
        if (nd.leaving && nd.s < 0.02) {
          nd.g.remove();
          nd.halo.remove();
          if (nd.leaf) nd.leaf.remove();
          if (nd.sorted) nd.sorted.remove();
          this.nodes.delete(nd.id);
        }
      }
      for (const ed of [...this.edges.values()]) {
        if ((ed.to === 0 && ed.o < 0.02) || !this.nodes.has(ed.id)) { ed.el.remove(); ed.hi.remove(); this.edges.delete(ed.id); }
      }
    }
  }

  window.TreeView = TreeView;
})();
