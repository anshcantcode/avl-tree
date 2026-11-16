/*
 * app.js - the page around the C tree.
 *
 * story() turns one recorded step into what the page shows: the frame the TreeView animates to,
 * the sentence that explains it, and the lines of C that ran. Everything else wires that up:
 * the visualiser (operations, player, code, output), the looping tree in the hero, the still
 * diagrams, the tabs, the height calculator and the footer mark.
 */
(function () {
  'use strict';

  const { Tree, EV, OP, NIL } = window.AVL;
  const T = { LOADED: 90, TSTART: 91, VISIT: 92, TDONE: 93 };   // steps the page makes itself
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const MINUS = '−', RSQ = '’';
  const signed = (v) => (v > 0 ? '+' + v : v < 0 ? MINUS + -v : '0');
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');
  const EMPTY = { root: NIL, nodes: [] };
  const OPNAME = { 1: 'insert', 2: 'delete', 3: 'search' };
  const TRAV = ['in-order', 'pre-order', 'post-order', 'level-order'];
  const isStart = (t) => t === EV.START || t === T.TSTART || t === T.LOADED;
  const isRotate = (t) => t === EV.ROTATE_LEFT || t === EV.ROTATE_RIGHT;

  /* ---------- reading a snapshot ---------- */

  const hOf = (snap, id) => (id === NIL ? 0 : snap.nodes[id].height);
  const bfOf = (snap, id) => hOf(snap, snap.nodes[id].left) - hOf(snap, snap.nodes[id].right);
  const treeHeight = (snap) => hOf(snap, snap.root);

  function idOfKey(snap, key) {
    let n = snap.root, guard = 0;
    while (n !== NIL && guard++ < 40) {
      const k = snap.nodes[n].key;
      if (k === key) return n;
      n = key < k ? snap.nodes[n].left : snap.nodes[n].right;
    }
    return NIL;
  }

  function parentOf(snap, id) {
    for (let i = 0; i < snap.nodes.length; i++) {
      const nd = snap.nodes[i];
      if (nd.used && (nd.left === id || nd.right === id)) return i;
    }
    return NIL;
  }

  function inorderKeys(snap) {
    const out = [];
    const walk = (id) => { if (id === NIL || out.length > 40) return; walk(snap.nodes[id].left); out.push(snap.nodes[id].key); walk(snap.nodes[id].right); };
    walk(snap.root);
    return out;
  }

  /* the three nodes a rotation works on: the tipped node, its taller child, and that child's taller child */
  function trioOf(ev) {
    const s = ev.snap, n = ev.a, nd = s.nodes[n];
    const c = ev.c === 1 || ev.c === 3 ? nd.left : nd.right;
    const g = ev.c === 1 || ev.c === 4 ? s.nodes[c].left : s.nodes[c].right;
    return [n, c, g];
  }

  /* ---------- the C, as shown in the code panel (condensed from src/avl.c) ---------- */

  const CODE = {
    insert: { title: 'insert_at, in avl.c', lines: [
      ['void insert_at(int *link, int key) {', 'fn'],
      ['  int n = *link;', ''],
      ['  if (n == NIL) {', 'place'],
      ['    *link = new_node(key);   // new leaf', 'place'],
      ['    return;', 'place'],
      ['  }', ''],
      ['  if (key < node[n].key)', 'cmpL'],
      ['    insert_at(&node[n].left, key);', 'cmpL'],
      ['  else if (key > node[n].key)', 'cmpR'],
      ['    insert_at(&node[n].right, key);', 'cmpR'],
      ['  else return;               // duplicate', 'dup'],
      ['  update_height(n);', 'height'],
      ['  rebalance(link);', 'height'],
      ['}', '']
    ] },
    rebalance: { title: 'rebalance, in avl.c', lines: [
      ['void rebalance(int *link) {', 'fn'],
      ['  int n = *link, b = bf(n);', ''],
      ['  if (b > 1) {                // left heavy', 'bL'],
      ['    int c = node[n].left;', 'bL'],
      ['    if (bf(c) < 0)            // left-right', 'LRq'],
      ['      node[n].left = rotate_left(c);', 'LRq'],
      ['    *link = rotate_right(n);', 'LL'],
      ['  } else if (b < -1) {        // right heavy', 'bR'],
      ['    int c = node[n].right;', 'bR'],
      ['    if (bf(c) > 0)            // right-left', 'RLq'],
      ['      node[n].right = rotate_right(c);', 'RLq'],
      ['    *link = rotate_left(n);', 'RR'],
      ['  }', ''],
      ['}', '']
    ] },
    rotR: { title: 'rotate_right, in avl.c', lines: [
      ['int rotate_right(int y) {', 'fn'],
      ['  int x = node[y].left;', 'rot'],
      ['  node[y].left = node[x].right;', 'rot'],
      ['  node[x].right = y;', 'rot'],
      ['  update_height(y);', 'rot'],
      ['  update_height(x);', 'rot'],
      ['  return x;               // the new top', 'rot'],
      ['}', '']
    ] },
    rotL: { title: 'rotate_left, in avl.c', lines: [
      ['int rotate_left(int x) {', 'fn'],
      ['  int y = node[x].right;', 'rot'],
      ['  node[x].right = node[y].left;', 'rot'],
      ['  node[y].left = x;', 'rot'],
      ['  update_height(x);', 'rot'],
      ['  update_height(y);', 'rot'],
      ['  return y;               // the new top', 'rot'],
      ['}', '']
    ] },
    delete: { title: 'delete_at, in avl.c', lines: [
      ['void delete_at(int *link, int key) {', 'fn'],
      ['  int n = *link;', ''],
      ['  if (n == NIL) return;      // not found', 'miss'],
      ['  if (key < node[n].key)', 'cmpL'],
      ['    delete_at(&node[n].left, key);', 'cmpL'],
      ['  else if (key > node[n].key)', 'cmpR'],
      ['    delete_at(&node[n].right, key);', 'cmpR'],
      ['  else if (!node[n].left || !node[n].right) {', 'found'],
      ['    *link = only_child(n);   // or NIL', 'remove'],
      ['    return;', 'remove'],
      ['  } else {                   // two children', 'two'],
      ['    int s = leftmost(node[n].right);', 'succ'],
      ['    node[n].key = node[s].key;', 'copy'],
      ['    delete_at(&node[n].right, node[s].key);', 'copy'],
      ['  }', ''],
      ['  update_height(n);', 'height'],
      ['  rebalance(link);', 'height'],
      ['}', '']
    ] },
    search: { title: 'avl_search, in avl.c', lines: [
      ['int avl_search(int key) {', 'fn'],
      ['  int n = root;', 'fn'],
      ['  while (n != NIL) {', 'loop'],
      ['    if (key == node[n].key) return 1;', 'eq'],
      ['    n = key < node[n].key ? node[n].left', 'step'],
      ['                          : node[n].right;', 'step'],
      ['  }', ''],
      ['  return 0;                  // not found', 'miss'],
      ['}', '']
    ] },
    trav0: { title: 'inorder, in avl.c', lines: [
      ['void inorder(int n) {', 'fn'],
      ['  if (n == NIL) return;', ''],
      ['  inorder(node[n].left);', ''],
      ['  visit(n);', 'visit'],
      ['  inorder(node[n].right);', ''],
      ['}', '']
    ] },
    trav1: { title: 'preorder, in avl.c', lines: [
      ['void preorder(int n) {', 'fn'],
      ['  if (n == NIL) return;', ''],
      ['  visit(n);', 'visit'],
      ['  preorder(node[n].left);', ''],
      ['  preorder(node[n].right);', ''],
      ['}', '']
    ] },
    trav2: { title: 'postorder, in avl.c', lines: [
      ['void postorder(int n) {', 'fn'],
      ['  if (n == NIL) return;', ''],
      ['  postorder(node[n].left);', ''],
      ['  postorder(node[n].right);', ''],
      ['  visit(n);', 'visit'],
      ['}', '']
    ] },
    trav3: { title: 'levelorder, in avl.c', lines: [
      ['void levelorder(void) {', 'fn'],
      ['  int queue[MAXN], head = 0, tail = 0;', 'fn'],
      ['  queue[tail++] = root;', 'fn'],
      ['  while (head < tail) {', ''],
      ['    int n = queue[head++];', 'visit'],
      ['    visit(n);', 'visit'],
      ['    if (node[n].left != NIL)', 'push'],
      ['      queue[tail++] = node[n].left;', 'push'],
      ['    if (node[n].right != NIL)', 'push'],
      ['      queue[tail++] = node[n].right;', 'push'],
      ['  }', ''],
      ['}', '']
    ] }
  };

  const TRAV_START = [
    'Left subtree, then the node, then the right subtree. On a search tree this reads the keys in sorted order.',
    'The node first, then its left subtree, then its right. Inserting keys in this order rebuilds the same tree.',
    'Both subtrees first, then the node: children before parents, the order to free a tree in.',
    'Level by level, left to right, with a queue: take a node from the front, add its children at the back.'
  ];
  const COST = {
    1: ['O(log n)', 'O(log n)', 'one path down and back up; the recursion keeps the path'],
    2: ['O(log n)', 'O(log n)', 'one path down and back up; the recursion keeps the path'],
    3: ['O(log n)', 'O(1)', 'one path down, in a loop'],
    trav: ['O(n)', 'O(log n)', 'every node once; the recursion holds one path'],
    level: ['O(n)', 'O(n)', 'every node once; the queue can hold a whole level']
  };

  /* ---------- one step: frame, words and code ---------- */

  function story(track, i) {
    const e = track[i], snap = e.snap;
    let s = i;
    while (s > 0 && !isStart(track[s].type)) s--;
    const st = track[s];
    const op = st.type === EV.START ? st.a : 0;
    const key = st.type === EV.START ? st.b : null;
    const path = [], succ = [], visited = [];
    let placed = NIL, found = NIL, trio = null, unwinding = false;
    for (let j = s; j <= i; j++) {
      const ev = track[j], t = ev.type;
      if (t === EV.COMPARE) path.push(ev.a);
      else if (t === EV.PLACE) placed = ev.a;
      else if (t === EV.FOUND) found = ev.a;
      else if (t === EV.SUCCESSOR) succ.push(ev.a);
      else if (t === EV.HEIGHT || t === EV.REMOVE) unwinding = true;
      else if (t === T.VISIT) visited.push(ev.a);
      if (t === EV.IMBALANCE) trio = trioOf(ev);
      else if (!isRotate(t)) trio = null;
    }
    const done = e.type === EV.DONE || e.type === T.TDONE;

    const cls = {};
    const add = (id, c) => { if (id === NIL || id === undefined) return; cls[id] = cls[id] ? cls[id] + ' ' + c : c; };
    if (!done) { path.forEach((id) => add(id, 'is-path')); succ.forEach((id) => add(id, 'is-path')); }
    if (placed !== NIL) add(placed, 'is-new');
    if (found !== NIL && (op === OP.SEARCH || !done) && e.type !== EV.REMOVE) add(found, 'is-found');
    visited.forEach((id) => add(id, 'is-visited'));
    if (trio) trio.forEach((id) => add(id, 'is-trio'));

    const frame = { snap, cls, ghost: null, spawn: NIL, pivot: null, fly: null, motion: 'move', hot: new Set(), trioEdges: new Set() };
    let code = op === OP.DELETE ? 'delete' : op === OP.SEARCH ? 'search' : 'insert', on = [];
    if (st.type === T.TSTART) code = 'trav' + st.a;

    switch (e.type) {
      case EV.START: frame.ghost = { key, mode: 'start' }; on = ['fn']; break;
      case EV.COMPARE:
        add(e.a, 'is-focus');
        frame.ghost = { key: e.b, at: e.a, side: e.c, mode: 'compare' };
        if (op === OP.SEARCH) on = e.c === 0 ? ['eq'] : ['loop', 'step'];
        else if (e.c < 0) on = ['cmpL'];
        else if (e.c > 0) on = ['cmpR'];
        else if (op === OP.INSERT) on = ['dup'];
        else on = [snap.nodes[e.a].left !== NIL && snap.nodes[e.a].right !== NIL ? 'two' : 'found'];
        break;
      case EV.PLACE:
        add(e.a, 'is-focus');
        frame.ghost = { key: snap.nodes[e.a].key, at: e.a, mode: 'merge' };
        frame.spawn = e.a; on = ['place'];
        break;
      case EV.DUPLICATE:
        add(e.a, 'is-alert');
        frame.ghost = { key: e.b, at: e.a, side: 0, mode: 'compare', shake: true }; on = ['dup'];
        break;
      case EV.HEIGHT:
        add(e.a, 'is-focus is-measure');
        if (Math.abs(e.c) >= 2) add(e.a, 'is-alert');
        on = ['height'];
        break;
      case EV.IMBALANCE:
        add(e.a, 'is-alert');
        code = 'rebalance'; on = { 1: ['bL', 'LL'], 2: ['bR', 'RR'], 3: ['bL', 'LRq'], 4: ['bR', 'RLq'] }[e.c];
        break;
      case EV.ROTATE_LEFT: case EV.ROTATE_RIGHT: {
        const right = e.type === EV.ROTATE_RIGHT;
        add(e.a, 'is-focus');
        frame.pivot = { a: e.a, b: e.b, dir: right ? 'right' : 'left' };
        frame.motion = 'rotate';
        code = right ? 'rotR' : 'rotL'; on = ['rot'];
        break;
      }
      case EV.FOUND:
        add(e.a, 'is-focus');
        if (op === OP.SEARCH) { frame.ghost = { key: e.b, at: e.a, mode: 'merge' }; on = ['eq']; }
        else {
          frame.ghost = { key: e.b, at: e.a, side: 0, mode: 'compare' };
          on = [snap.nodes[e.a].left !== NIL && snap.nodes[e.a].right !== NIL ? 'two' : 'found'];
        }
        break;
      case EV.NOT_FOUND:
        if (e.a !== NIL) add(e.a, 'is-focus');
        frame.ghost = { key: e.b, at: e.a, side: e.c, mode: 'miss', shake: true }; on = ['miss'];
        break;
      case EV.SUCCESSOR: add(e.a, 'is-focus'); on = ['succ']; break;
      case EV.COPY:
        add(e.a, 'is-found'); add(e.b, 'is-focus');
        frame.fly = { from: e.b, to: e.a, key: e.c }; on = ['copy'];
        break;
      case EV.REMOVE: if (e.c !== NIL) add(e.c, 'is-focus'); on = ['remove']; break;
      case EV.FULL: frame.ghost = { key, mode: 'start', shake: true }; on = ['fn']; break;
      case T.VISIT: add(e.a, 'is-focus'); on = ['visit']; break;
      case T.TSTART: on = ['fn']; break;
      default: break;
    }

    if (!unwinding && !done) {
      path.slice(1).forEach((id) => frame.hot.add(id));
      succ.forEach((id) => frame.hot.add(id));
      if (placed !== NIL) frame.hot.add(placed);
    }
    if (trio) trio.forEach((id) => { if (trio.includes(parentOf(snap, id))) frame.trioEdges.add(id); });

    const w = words(track, i, { op, key, visited });
    return { frame, title: w.title, body: w.body, code, on, op, kind: st.type === T.TSTART ? st.a : null };
  }

  function words(track, i, x) {
    const e = track[i], s = e.snap, k = x.key;
    const K = (id) => s.nodes[id].key;
    switch (e.type) {
      case T.LOADED: return e.note;
      case EV.START:
        if (x.op === OP.INSERT) return { title: 'insert ' + k, body: s.root === NIL ? 'The tree is empty, so ' + k + ' will become the root.' : 'Start at the root. Smaller keys go left, larger keys go right, until there is an empty spot.' };
        if (x.op === OP.DELETE) return { title: 'delete ' + k, body: 'First find ' + k + ' the way a search does. Then take it out, and rebalance on the way back up.' };
        return { title: 'search ' + k, body: 'Start at the root and compare. Every comparison rules out a whole subtree.' };
      case EV.COMPARE: {
        const n = K(e.a);
        if (e.c === 0) return { title: k + ' = ' + n, body: x.op === OP.INSERT ? k + ' is already in the tree.' : 'This is the node.' };
        const dir = e.c < 0 ? 'left' : 'right';
        const why = x.op === OP.INSERT ? 'so it belongs in ' + n + RSQ + 's ' + dir + ' subtree.' : 'so it can only be in ' + n + RSQ + 's ' + dir + ' subtree.';
        return { title: k + (e.c < 0 ? ' < ' : ' > ') + n + ', go ' + dir, body: k + ' is ' + (e.c < 0 ? 'smaller' : 'larger') + ' than ' + n + ', ' + why };
      }
      case EV.PLACE:
        if (e.b === NIL) return { title: k + ' becomes the root', body: 'A tree of one node is balanced: height 1, balance 0.' };
        return { title: k + ' placed', body: K(e.b) + ' has no ' + (e.c < 0 ? 'left' : 'right') + ' child, so ' + k + ' becomes a new leaf there. Now walk back up and update every height on the path.' };
      case EV.DUPLICATE: return { title: k + ' is already here', body: 'A search tree holds each key once, so nothing changes.' };
      case EV.HEIGHT: {
        const n = K(e.a), b = e.c;
        const title = n + ': height ' + e.b + ', balance ' + signed(b);
        if (b === 0) return { title, body: 'Balance is the left height minus the right height. Both sides of ' + n + ' are equally tall.' };
        if (Math.abs(b) === 1) return { title, body: n + ' leans one level to the ' + (b > 0 ? 'left' : 'right') + '. That is allowed: an AVL tree accepts ' + MINUS + '1, 0 and +1.' };
        return { title, body: 'One side of ' + n + ' is two levels taller than the other. That breaks the rule.' };
      }
      case EV.IMBALANCE: {
        const n = K(e.a), [, c] = trioOf(e), ck = K(c);
        const body = {
          1: 'Too tall on the left, and the extra level is down ' + ck + RSQ + 's left side: a left-left case. One right rotation at ' + n + ' fixes it.',
          2: 'Too tall on the right, and the extra level is down ' + ck + RSQ + 's right side: a right-right case. One left rotation at ' + n + ' fixes it.',
          3: 'Too tall on the left, but the extra level is down ' + ck + RSQ + 's right side: a left-right case. Rotate left at ' + ck + ' first, then right at ' + n + '.',
          4: 'Too tall on the right, but the extra level is down ' + ck + RSQ + 's left side: a right-left case. Rotate right at ' + ck + ' first, then left at ' + n + '.'
        }[e.c];
        let above = false;
        for (let p = parentOf(s, e.a), g = 0; p !== NIL && g < 40; p = parentOf(s, p), g++) if (Math.abs(bfOf(s, p)) >= 2) above = true;
        return { title: n + ' is out of balance (' + signed(e.b) + ')', body: body + (above ? ' Nodes above may read ' + MINUS + '2 or +2 too; fixing the lowest one repairs them.' : '') };
      }
      case EV.ROTATE_LEFT: case EV.ROTATE_RIGHT: {
        const right = e.type === EV.ROTATE_RIGHT, dir = right ? 'right' : 'left';
        const up = K(e.a), down = K(e.b);
        const moved = right ? s.nodes[e.b].left : s.nodes[e.b].right;
        let body = up + ' moves up, and ' + down + ' moves down to become its ' + dir + ' child.';
        if (moved !== NIL) body += ' ' + K(moved) + ' changes parent, from ' + up + ' to ' + down + '.';
        body += e.c === 1 ? ' The three nodes now form a straight line.' : ' Left to right, the keys are still in order.';
        return { title: (e.c === 1 ? '1 of 2: ' : e.c === 2 ? '2 of 2: ' : '') + 'rotate ' + dir + ' at ' + down, body };
      }
      case EV.FOUND: {
        if (x.op === OP.SEARCH) return { title: 'found ' + k, body: k + ' is in the tree, ' + plural(e.comparisons, 'comparison') + ' from the root.' };
        const nd = s.nodes[e.a], kk = K(e.a);
        if (nd.left === NIL && nd.right === NIL) return { title: 'found ' + kk + ', a leaf', body: kk + ' has no children, so it can simply be removed.' };
        if (nd.left === NIL || nd.right === NIL) return { title: 'found ' + kk + ', one child', body: kk + ' has one child, which moves up into its place.' };
        return { title: 'found ' + kk + ', two children', body: 'Taking ' + kk + ' out would leave two subtrees and one gap. Fill the gap with its successor: the smallest key to its right.' };
      }
      case EV.NOT_FOUND:
        if (e.a === NIL) return { title: k + ' is not here', body: 'The tree is empty.' };
        return { title: k + ' is not in the tree', body: K(e.a) + ' has no ' + (e.c < 0 ? 'left' : 'right') + ' child, and that was the only place ' + k + ' could be.' };
      case EV.SUCCESSOR: {
        const first = track[i - 1] && track[i - 1].type === EV.FOUND, sk = K(e.a), last = s.nodes[e.a].left === NIL;
        if (first) return { title: 'one step right, to ' + sk, body: 'The successor is the smallest key on the right: go right once, then left as far as possible.' + (last ? ' ' + sk + ' has no left child, so it is the one.' : '') };
        return { title: 'left, to ' + sk, body: last ? sk + ' has no left child, so ' + sk + ' is the successor.' : 'Keep going left: there are smaller keys below.' };
      }
      case EV.COPY: return { title: e.c + ' replaces ' + e.d, body: 'Copy ' + e.c + ' into ' + e.d + RSQ + 's node; the order still holds. Then delete the old ' + e.c + ' from the right subtree, which is easy: it has at most one child.' };
      case EV.REMOVE: return { title: e.b + ' removed', body: (e.c === NIL ? e.b + ' had no children, so it simply goes.' : K(e.c) + ' moves up into ' + e.b + RSQ + 's place.') + ' Now walk back up and check the heights.' };
      case EV.FULL: return { title: 'the tree is full', body: 'This page holds 31 keys, a perfect tree of height 5. Delete one to make room.' };
      case EV.DONE: {
        const c = plural(e.c, 'comparison'), r = plural(e.d, 'rotation');
        if (e.a === OP.INSERT) {
          if (e.b === 1) return { title: k + ' inserted', body: c + ', ' + r + '. Every balance is back within ' + MINUS + '1 to +1.' };
          if (e.b === 0) return { title: 'nothing inserted', body: k + ' was already in the tree. ' + c + '.' };
          return { title: 'nothing inserted', body: 'The tree is full. Delete a key first.' };
        }
        if (e.a === OP.DELETE) return e.b ? { title: k + ' deleted', body: c + ', ' + r + '. The tree is balanced again.' } : { title: 'nothing deleted', body: k + ' is not in the tree. ' + c + '.' };
        return e.b ? { title: 'found ' + k + ' in ' + c, body: 'A search changes nothing, so there is nothing to rebalance.' } : { title: k + ' not found', body: c + ', down to an empty spot.' };
      }
      case T.TSTART: return { title: TRAV[e.a] + ' traversal', body: TRAV_START[e.a] };
      case T.VISIT: return { title: 'visit ' + e.b, body: x.visited.map((id) => K(id)).join(', ') };
      case T.TDONE: return { title: TRAV[e.a] + ': ' + plural(e.b, 'key'), body: e.a === 0 ? 'Sorted, every time: in-order on a search tree reads the keys from smallest to largest.' : 'Every node visited once, so the traversal takes O(n) time.' };
      default: return { title: '', body: '' };
    }
  }

  /* ---------- the same keys in a plain search tree, for comparison ---------- */

  class PlainBST {
    constructor() { this.root = null; }
    reset() { this.root = null; }
    insert(k) {
      const n = { k, l: null, r: null };
      if (!this.root) { this.root = n; return; }
      for (let p = this.root; ;) {
        if (k === p.k) return;
        const side = k < p.k ? 'l' : 'r';
        if (!p[side]) { p[side] = n; return; }
        p = p[side];
      }
    }
    remove(k) {
      const del = (n, key) => {
        if (!n) return null;
        if (key < n.k) n.l = del(n.l, key);
        else if (key > n.k) n.r = del(n.r, key);
        else {
          if (!n.l) return n.r;
          if (!n.r) return n.l;
          let s = n.r; while (s.l) s = s.l;
          n.k = s.k; n.r = del(n.r, s.k);
        }
        return n;
      };
      this.root = del(this.root, k);
    }
    height() { const h = (n) => (n ? 1 + Math.max(h(n.l), h(n.r)) : 0); return h(this.root); }
  }

  /* tallest an AVL tree of n keys can be: the sparsest AVL tree of height h has N(h) = N(h-1) + N(h-2) + 1 keys */
  function worstAvl(n) {
    if (n <= 0) return 0;
    const N = [0, 1];
    for (;;) { const next = N[N.length - 1] + N[N.length - 2] + 1; if (next > n) break; N.push(next); }
    return N.length - 1;
  }
  const perfectHeight = (n) => (n <= 0 ? 0 : Math.ceil(Math.log2(n + 1)));

  /* ---------- the visualiser ---------- */

  const DUR = {
    1: 900, 2: 900, 3: 1100, 4: 1500, 5: 750, 6: 1700, 7: 1800, 8: 1800, 9: 1200, 10: 1500,
    11: 950, 12: 1400, 13: 1200, 14: 1500, 15: 1300, 90: 700, 91: 1000, 92: 700, 93: 1300
  };

  const PRESETS = {
    root: { build: [50, 20, 70, 10, 30, 60, 80, 25, 35, 5], op: 'insert', keys: [27], title: 'ten keys, then 27',
      body: 'Inserting 27 makes the root two levels too heavy on the left, the hard way round: a double rotation. Press play.' },
    ll: { build: [30, 20], op: 'insert', keys: [10], title: 'left-left', body: '30 and 20 are in. 10 goes left of 20, and 30 tips to +2.' },
    rr: { build: [10, 20], op: 'insert', keys: [30], title: 'right-right', body: '10 and 20 are in. 30 goes right of 20, and 10 tips to ' + MINUS + '2.' },
    lr: { build: [30, 10], op: 'insert', keys: [20], title: 'left-right', body: '30 and 10 are in. 20 goes to the right of 10: a bend, which needs two rotations.' },
    rl: { build: [10, 30], op: 'insert', keys: [20], title: 'right-left', body: '10 and 30 are in. 20 goes to the left of 30: a bend, which needs two rotations.' },
    sorted: { build: [], op: 'insert', keys: [10, 20, 30, 40, 50, 60, 70], title: '10 to 70, in order',
      body: 'Sorted keys turn a plain search tree into a line. Watch the AVL tree rotate after 30, 50, 60 and 70 and end three levels deep.' },
    del: { build: [50, 20, 70, 10, 30, 60, 80, 25, 35, 5], op: 'delete', keys: [20], title: 'delete 20',
      body: '20 has two children, so its successor, 25, takes its place.' },
    random: { build: [], op: 'insert', keys: null, title: 'twelve random keys', body: '' }
  };

  const vz = { tree: null, bst: new PlainBST(), view: null, track: [], i: 0, playing: false, timer: 0, speed: 1, snap: EMPTY, touched: false, codeName: null, result: null };
  const ui = {};

  async function initVisualiser() {
    const svg = $('#vz-svg');
    if (!svg) return;
    ['key', 'note', 'title', 'body', 'story', 'comp', 'rot', 'h', 'code-name', 'code', 'play', 'scrub', 'ticks', 'count',
      'result', 'cost', 'out-name', 'chips', 'n', 'h-avl', 'h-bst', 'h-best', 'h-worst', 'example'].forEach((id) => { ui[id] = $('#vz-' + id); });
    vz.tree = await Tree.create();
    vz.view = new TreeView(svg, {
      maxR: 30, minR: 12, maxCol: 96, maxLevel: 100, top: window.matchMedia('(max-width: 760px)').matches ? 0.16 : 0.15, bottom: 0.03, sorted: true,
      onPick: (k) => { ui.key.value = k; ui.key.focus(); ui.key.select(); note('Picked ' + k + '. Now delete it, or search for it.'); }
    });

    $('#vz-form').addEventListener('submit', (ev) => { ev.preventDefault(); runOp((ev.submitter && ev.submitter.dataset.op) || 'insert'); });
    $$('[data-trav]').forEach((b) => b.addEventListener('click', () => runTraversal(+b.dataset.trav)));
    ui.example.addEventListener('change', () => { if (ui.example.value) { vz.touched = true; loadPreset(ui.example.value, { autoplay: true }); } });
    $('#vz-clear').addEventListener('click', clearTree);
    $('#vz-heights').addEventListener('click', (ev) => {
      const on = ev.currentTarget.getAttribute('aria-pressed') !== 'true';
      ev.currentTarget.setAttribute('aria-pressed', String(on));
      svg.classList.toggle('show-h', on);
    });
    $('#vz-replay').addEventListener('click', () => { vz.touched = true; show(0, 0); play(); });
    $('#vz-back').addEventListener('click', () => { vz.touched = true; pause(); if (vz.i > 0) show(vz.i - 1, -1); });
    $('#vz-next').addEventListener('click', () => { vz.touched = true; pause(); if (vz.i < vz.track.length - 1) show(vz.i + 1, 1); });
    $('#vz-end').addEventListener('click', () => { vz.touched = true; pause(); show(vz.track.length - 1, 0); });
    ui.play.addEventListener('click', () => { vz.touched = true; vz.playing ? pause() : play(); });
    ui.scrub.addEventListener('input', () => { vz.touched = true; pause(); show(+ui.scrub.value, 0); });
    $$('[data-speed]').forEach((b) => b.addEventListener('click', () => {
      vz.speed = +b.dataset.speed;
      vz.view.setSpeed(vz.speed);
      $$('[data-speed]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
      if (vz.playing) schedule();
    }));

    document.addEventListener('keydown', (ev) => {
      if (!vz.inView || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      const t = ev.target, tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (ev.key === ' ' && tag !== 'BUTTON' && tag !== 'A') { ev.preventDefault(); vz.touched = true; vz.playing ? pause() : play(); }
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); $('#vz-next').click(); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); $('#vz-back').click(); }
    });

    loadPreset('root', { autoplay: false });

    /* start playing the first time the stage is properly in view */
    const stage = $('#vz-stage');
    new IntersectionObserver((entries) => {
      for (const en of entries) {
        vz.inView = en.isIntersecting;
        if (en.isIntersecting && en.intersectionRatio >= 0.45 && !vz.touched && !vz.autoplayed) { vz.autoplayed = true; play(); }
      }
    }, { threshold: [0, 0.45] }).observe(stage);
  }

  function note(text, bad) {
    ui.note.textContent = text || '';
    ui.note.classList.toggle('is-bad', !!bad);
  }

  function parseKeys(text) {
    const parts = String(text).split(/[\s,;]+/).filter(Boolean);
    if (!parts.length) return { error: 'Type a key first, like 42, or a few: 10, 20, 30.' };
    const keys = [];
    for (const p of parts) {
      if (!/^\d+$/.test(p)) return { error: '“' + p + '” is not a whole number from 0 to 999.' };
      const v = +p;
      if (v > 999) return { error: 'Keys run from 0 to 999.' };
      keys.push(v);
    }
    if (keys.length > 31) return { error: 'At most 31 keys at a time.' };
    return { keys };
  }

  function apply(kind, keys, track) {
    for (const k of keys) {
      const evs = kind === 'insert' ? vz.tree.insert(k) : kind === 'delete' ? vz.tree.remove(k) : vz.tree.search(k);
      const d = evs[evs.length - 1];
      if (kind === 'insert' && d.b === 1) vz.bst.insert(k);
      if (kind === 'delete' && d.b === 1) vz.bst.remove(k);
      track.push(...evs);
    }
    if (track.length) vz.snap = track[track.length - 1].snap;
    return track;
  }

  function runOp(kind) {
    const p = parseKeys(ui.key.value);
    if (p.error) {
      note(p.error, true);
      ui.key.classList.remove('is-shake'); void ui.key.offsetWidth; ui.key.classList.add('is-shake');
      ui.key.focus();
      return;
    }
    note('');
    vz.touched = true;
    ui.example.value = '';
    loadTrack(apply(kind, p.keys, []), { autoplay: true });
    ui.key.select();
  }

  function runTraversal(kind) {
    vz.touched = true;
    const snap = vz.snap, keys = vz.tree.traverse(kind);
    if (!keys.length) { note('The tree is empty. Insert a few keys first.', true); return; }
    note('');
    const mk = (type, a, b) => ({ type, a, b, c: 0, d: 0, comparisons: 0, rotations: 0, count: keys.length, snap });
    const track = [mk(T.TSTART, kind, 0)];
    keys.forEach((k) => track.push(mk(T.VISIT, idOfKey(snap, k), k)));
    track.push(mk(T.TDONE, kind, keys.length));
    track.order = keys;
    loadTrack(track, { autoplay: true });
  }

  function loadPreset(id, opts) {
    const p = PRESETS[id];
    vz.tree.reset(); vz.bst.reset();
    let snap = EMPTY;
    for (const k of p.build) { const evs = vz.tree.insert(k); snap = evs[evs.length - 1].snap; vz.bst.insert(k); }
    vz.snap = snap;
    let keys = p.keys, body = p.body;
    if (!keys) {
      const pool = new Set();
      while (pool.size < 12) pool.add(1 + Math.floor(Math.random() * 99));
      keys = [...pool];
      body = keys.join(', ') + ', inserted one after another. Expect a few rotations on the way.';
    }
    const track = [{ type: T.LOADED, a: 0, b: 0, c: 0, d: 0, comparisons: 0, rotations: 0, count: p.build.length, snap, note: { title: p.title, body } }];
    apply(p.op, keys, track);
    ui.key.value = keys.join(', ');
    vz.view.reset();
    loadTrack(track, opts, true);
  }

  function clearTree() {
    vz.touched = true;
    vz.tree.reset(); vz.bst.reset(); vz.snap = EMPTY;
    ui.example.value = '';
    ui.key.value = '';
    note('');
    loadTrack([{ type: T.LOADED, a: 0, b: 0, c: 0, d: 0, comparisons: 0, rotations: 0, count: 0, snap: EMPTY,
      note: { title: 'an empty tree', body: 'Type a key and press insert. Try 10, 20, 30 to see the first rotation.' } }], {});
    ui.key.focus();
  }

  function loadTrack(track, opts, fresh) {
    pause();
    vz.track = track;
    vz.result = null;
    ui.scrub.max = String(Math.max(0, track.length - 1));
    renderTicks();
    show(0, 0, fresh);
    if (opts && opts.autoplay) play();
  }

  function renderTicks() {
    const n = vz.track.length;
    const frag = document.createDocumentFragment();
    const dense = n > 90;
    vz.track.forEach((e, j) => {
      const rot = isRotate(e.type), start = isStart(e.type);
      if (dense && !rot && !start) return;
      const d = document.createElement('i');
      d.className = rot ? 'is-rot' : start ? 'is-start' : '';
      d.style.left = (n > 1 ? (j / (n - 1)) * 100 : 0) + '%';
      frag.appendChild(d);
    });
    ui.ticks.replaceChildren(frag);
  }

  function show(i, dir, fresh) {
    const t = vz.track;
    vz.i = i;
    const st = story(t, i);
    const e = t[i];
    /* stepping back over a rotation swings the nodes back the way they came */
    if (dir < 0 && t[i + 1] && isRotate(t[i + 1].type)) {
      const r = t[i + 1];
      st.frame.motion = 'rotate';
      st.frame.pivot = { a: r.b, b: r.a, dir: r.type === EV.ROTATE_RIGHT ? 'left' : 'right', silent: true };
    }
    if (fresh) st.frame.stagger = true;
    vz.view.show(st.frame);

    ui.title.textContent = st.title;
    ui.body.textContent = st.body;
    if (!reduceMotion.matches) { ui.story.classList.remove('is-in'); void ui.story.offsetWidth; ui.story.classList.add('is-in'); }

    const isTrav = st.kind !== null;
    ui.comp.textContent = isTrav ? '0' : e.comparisons;
    ui.rot.textContent = isTrav ? '0' : e.rotations;
    ui.h.textContent = treeHeight(e.snap);
    renderCode(st.code, st.on);

    ui.scrub.value = String(i);
    ui.scrub.style.setProperty('--p', (t.length > 1 ? (i / (t.length - 1)) * 100 : 0) + '%');
    ui.count.textContent = (i + 1) + ' / ' + t.length;

    if (e.type === EV.DONE) {
      const last = t.length - 1 === i;
      const parts = [OPNAME[e.a] + ' ' + t.slice(0, i + 1).reverse().find((x) => x.type === EV.START).b];
      parts.push(e.a === OP.INSERT ? (e.b === 1 ? 'inserted' : e.b === 0 ? 'already there' : 'tree full') : e.a === OP.DELETE ? (e.b ? 'deleted' : 'not found') : (e.b ? 'found' : 'not found'));
      vz.result = parts.join(': ') + ', ' + plural(e.c, 'comparison') + ', ' + plural(e.d, 'rotation') + (last ? '' : '');
    } else if (e.type === T.TDONE) vz.result = TRAV[e.a] + ': ' + plural(e.b, 'key') + ' visited';
    else if (i === 0) vz.result = null;
    ui.result.textContent = vz.result || (e.type === T.LOADED ? e.note.title : st.title);

    let cost;
    if (isTrav) cost = st.kind === 3 ? COST.level : COST.trav;
    else cost = COST[st.op] || COST[1];
    ui.cost.textContent = 'time ' + cost[0] + ', extra space ' + cost[1] + ': ' + cost[2] + '.';

    renderChips(st, e, isTrav);

    const end = vz.snap, n = inorderKeys(end).length;
    ui.n.textContent = n;
    ui['h-avl'].textContent = treeHeight(end);
    ui['h-bst'].textContent = vz.bst.height();
    ui['h-best'].textContent = perfectHeight(n);
    ui['h-worst'].textContent = worstAvl(n);
    setPlayState();
  }

  function renderChips(st, e, isTrav) {
    const t = vz.track;
    let keys, lit = new Set(), now = null;
    if (isTrav) {
      ui['out-name'].textContent = TRAV[st.kind] + ' output';
      keys = t.order || [];
      t.slice(0, vz.i + 1).forEach((x) => { if (x.type === T.VISIT) lit.add(x.b); });
      if (e.type === T.VISIT) now = e.b;
    } else {
      ui['out-name'].textContent = 'keys in order';
      keys = inorderKeys(e.snap);
      keys.forEach((k) => lit.add(k));
      const start = t.slice(0, vz.i + 1).reverse().find((x) => x.type === EV.START);
      if (start) now = start.b;
    }
    const frag = document.createDocumentFragment();
    keys.forEach((k) => {
      const li = document.createElement('li');
      li.textContent = k;
      if (lit.has(k)) li.className = 'is-on';
      if (k === now) li.className += ' is-now';
      frag.appendChild(li);
    });
    if (!keys.length) { const li = document.createElement('li'); li.className = 'is-empty'; li.textContent = 'empty'; frag.appendChild(li); }
    ui.chips.replaceChildren(frag);
  }

  function highlightC(text) {
    const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const cut = esc.indexOf('//');
    const codePart = cut >= 0 ? esc.slice(0, cut) : esc, comment = cut >= 0 ? esc.slice(cut) : '';
    return codePart.replace(/\b(int|void|if|else|return|while)\b/g, '<span class="k">$1</span>') + (comment ? '<span class="c">' + comment + '</span>' : '');
  }

  function renderCode(name, on) {
    const box = ui.code;
    if (name !== vz.codeName) {
      vz.codeName = name;
      const src = CODE[name];
      ui['code-name'].textContent = src.title;
      box.innerHTML = src.lines.map(([text, tags]) => '<span class="ln" data-t="' + tags + '">' + (highlightC(text) || ' ') + '</span>').join('');
      if (!reduceMotion.matches) { box.classList.remove('is-in'); void box.offsetWidth; box.classList.add('is-in'); }
    }
    let first = null;
    $$('.ln', box).forEach((ln) => {
      const hit = on.length > 0 && ln.dataset.t.split(' ').some((t) => t && on.includes(t));
      ln.classList.toggle('is-on', hit);
      if (hit && !first) first = ln;
    });
    const wrap = box.parentElement;
    if (first && wrap.scrollHeight > wrap.clientHeight) {
      const top = first.offsetTop - wrap.clientHeight * 0.3;
      wrap.scrollTo({ top: Math.max(0, top), behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    }
  }

  function setPlayState() {
    const atEnd = vz.i >= vz.track.length - 1;
    ui.play.classList.toggle('is-playing', vz.playing);
    ui.play.setAttribute('aria-label', vz.playing ? 'pause' : atEnd && vz.track.length > 1 ? 'play again' : 'play');
  }

  function play() {
    if (vz.track.length < 2) return;
    if (vz.i >= vz.track.length - 1) show(0, 0);
    vz.playing = true;
    setPlayState();
    schedule();
  }

  function pause() {
    vz.playing = false;
    clearTimeout(vz.timer);
    if (ui.play) setPlayState();
  }

  function schedule() {
    clearTimeout(vz.timer);
    if (!vz.playing) return;
    const e = vz.track[vz.i];
    vz.timer = setTimeout(() => {
      if (vz.i >= vz.track.length - 1) { pause(); return; }
      show(vz.i + 1, 1);
      if (vz.i >= vz.track.length - 1) pause(); else schedule();
    }, (DUR[e.type] || 900) / vz.speed);
  }

  /* used by the rotation section and the hood section */
  function watch(id) {
    if (!vz.tree) return;
    vz.touched = true;
    ui.example.value = id;
    loadPreset(id, { autoplay: true });
    $('#visualiser').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
  }

  /* ---------- the tree in the hero ---------- */

  const HERO_DUR = { 90: 1500, 1: 600, 2: 440, 3: 700, 5: 220, 6: 950, 7: 1250, 8: 1250, 15: 380 };
  /* seven keys sit level; six more go in and tip it three times (right-right, left-left, left-right) */
  const HERO_BASE = [40, 20, 60, 10, 30, 50, 70], HERO_ADD = [80, 90, 5, 1, 25, 27];

  async function initHero() {
    const svg = $('#hero-svg');
    if (!svg) return;
    const small = window.matchMedia('(max-width: 760px)').matches;
    const view = new TreeView(svg, { maxR: 30, minR: small ? 13 : 15, maxCol: 104, maxLevel: small ? 70 : 84, top: 0.16, bottom: 0.12 });
    view.setSpeed(1.35);
    const t = await Tree.create();
    let base = EMPTY;
    HERO_BASE.forEach((k) => { const evs = t.insert(k); base = evs[evs.length - 1].snap; });
    const track = [{ type: T.LOADED, a: 0, b: 0, c: 0, d: 0, comparisons: 0, rotations: 0, count: HERO_BASE.length, snap: base, note: { title: 'seven keys, level', body: '' } }];
    HERO_ADD.forEach((k) => track.push(...t.insert(k)));
    const caption = $('#hero-step');

    /* the stage is never empty: the seven keys are there before anything moves */
    const first = story(track, 0);
    first.frame.stagger = true;
    view.show(first.frame);
    caption.textContent = first.title;

    if (reduceMotion.matches) {
      view.show(story(track, track.length - 1).frame);
      caption.textContent = 'thirteen keys, four levels';
      return;
    }

    let i = 1, timer = 0, running = false, onScreen = true;
    const step = () => {
      if (i < track.length) {
        const st = story(track, i);
        view.show(st.frame);
        caption.textContent = st.title;
        const d = HERO_DUR[track[i].type] || 500;
        i++;
        timer = setTimeout(step, i === track.length ? 3400 : d);
      } else {
        /* rewind: the six new keys drop out and the first seven slide home */
        view.show(story(track, 0).frame);
        caption.textContent = 'seven keys, level';
        i = 1;
        timer = setTimeout(step, 1800);
      }
    };
    const update = () => {
      const want = onScreen && !document.hidden;
      if (want && !running) { running = true; step(); }
      else if (!want && running) { running = false; clearTimeout(timer); }
    };
    new IntersectionObserver((en) => { onScreen = en[0].isIntersecting; update(); }, { threshold: 0.05 }).observe(svg);
    document.addEventListener('visibilitychange', update);
  }

  /* ---------- running something only while it is on screen ---------- */

  function gate(el, fn, threshold) {
    let on = false;
    const update = () => fn(on && !document.hidden);
    new IntersectionObserver((en) => { on = en[0].isIntersecting; update(); }, { threshold: threshold || 0.15 }).observe(el);
    document.addEventListener('visibilitychange', update);
  }

  function bump(el, v) {
    const text = String(v);
    if (el.textContent === text) return;
    el.textContent = text;
    if (reduceMotion.matches) return;
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }

  /* ---------- 2. the race: 1 to 15 into a plain search tree and into an AVL tree ---------- */

  /* a plain search tree as a snapshot the view can draw; node ids are the insertion order */
  function bstSnap(keys) {
    const nodes = [];
    let root = NIL;
    for (const k of keys) {
      const id = nodes.length;
      nodes.push({ key: k, left: NIL, right: NIL, height: 1, used: 1 });
      if (root === NIL) { root = id; continue; }
      for (let p = root; ;) {
        const side = k < nodes[p].key ? 'left' : 'right';
        if (nodes[p][side] === NIL) { nodes[p][side] = id; break; }
        p = nodes[p][side];
      }
    }
    const h = (id) => (id === NIL ? 0 : (nodes[id].height = 1 + Math.max(h(nodes[id].left), h(nodes[id].right))));
    h(root);
    return { root, nodes };
  }

  const RACE = Array.from({ length: 15 }, (_, i) => i + 1);

  async function initRace() {
    const sb = $('#race-bst'), sa = $('#race-avl');
    if (!sb || !sa) return;
    const opts = { maxR: 24, minR: 9, maxCol: 72, maxLevel: 64, top: 0.1, bottom: 0.06 };
    const vb = new TreeView(sb, opts), va = new TreeView(sa, opts);
    vb.setSpeed(1.5); va.setSpeed(1.5);
    const hb = $('#race-h-bst'), ha = $('#race-h-avl'), now = $('#race-now');
    const t = await Tree.create();

    /* one beat per key, and two more for every rotation: the node tipping, then the turn */
    const beats = [];
    RACE.forEach((k, i) => {
      const bs = bstSnap(RACE.slice(0, i + 1));
      const evs = t.insert(k);
      const frame = (j) => { const f = story(evs, j).frame; f.ghost = null; return f; };
      const place = evs.findIndex((e) => e.type === EV.PLACE);
      beats.push({ key: k, b: { snap: bs, cls: { [i]: 'is-new' } }, hb: bs.nodes[bs.root].height, a: frame(place), ha: treeHeight(evs[place].snap), dur: 440 });
      evs.forEach((e, j) => {
        if (e.type === EV.IMBALANCE) beats.push({ key: k, a: frame(j), ha: treeHeight(e.snap), dur: 480 });
        else if (isRotate(e.type)) beats.push({ key: k, a: frame(j), ha: treeHeight(e.snap), dur: 760 });
      });
      const end = evs[evs.length - 1].snap;
      beats.push({ key: k, a: { snap: end, cls: {} }, ha: treeHeight(end), dur: 90 });
    });
    const lastB = beats.filter((b) => b.b).pop(), lastA = beats[beats.length - 1];

    const showBeat = (bt) => {
      if (bt.b) { vb.show(bt.b); bump(hb, bt.hb); }
      va.show(bt.a); bump(ha, bt.ha);
      now.textContent = 'insert ' + bt.key;
    };
    const finish = () => {
      vb.show({ snap: lastB.b.snap, cls: {} }); va.show(lastA.a);
      hb.textContent = lastB.hb; ha.textContent = lastA.ha;
      now.textContent = '1 to 15, in order';
    };
    if (reduceMotion.matches) { finish(); $('#race-replay').hidden = true; return; }

    /* the panes open on the result, a line against a bush; then the race runs from the first key */
    finish();
    now.textContent = '15 levels against ' + lastA.ha;
    let i = 0, timer = 0, running = false, shown = false;
    const restart = () => {
      vb.show({ snap: EMPTY, cls: {} }); va.show({ snap: EMPTY, cls: {} });
      hb.textContent = '0'; ha.textContent = '0'; now.textContent = '1 to 15, in order';
      i = 0; timer = setTimeout(step, 700);
    };
    const step = () => {
      if (i < beats.length) { const bt = beats[i++]; showBeat(bt); timer = setTimeout(step, bt.dur); return; }
      now.textContent = '15 levels against ' + lastA.ha;
      timer = setTimeout(restart, 4600);
    };
    gate($('.race-grid'), (on) => {
      if (on && !running) { running = true; timer = setTimeout(i ? step : restart, i ? 0 : shown ? 300 : 1600); shown = true; }
      else if (!on && running) { running = false; clearTimeout(timer); }
    }, 0.3);
    $('#race-replay').addEventListener('click', () => {
      clearTimeout(timer);
      vb.reset(); va.reset();
      vb.show({ snap: EMPTY, cls: {} }); va.show({ snap: EMPTY, cls: {} });
      hb.textContent = '0'; ha.textContent = '0';
      i = 0;
      if (running) timer = setTimeout(step, 300);
    });
  }

  /* ---------- 4. the four rotations, each one on a loop ---------- */

  const TILE_DUR = { 90: 1100, 1: 520, 2: 560, 3: 640, 5: 240, 6: 1050, 7: 1350, 8: 1350, 15: 2000 };
  const CASES = { ll: [30, 20, 10], rr: [10, 20, 30], lr: [30, 10, 20], rl: [10, 30, 20] };

  async function initRotations() {
    const tiles = $$('.rot-tile[data-case]');
    if (!tiles.length) return;
    const t = await Tree.create();
    tiles.forEach((tile, n) => {
      const keys = CASES[tile.dataset.case];
      t.reset(); t.insert(keys[0]);
      const two = t.insert(keys[1]);
      const loaded = { type: T.LOADED, a: 0, b: 0, c: 0, d: 0, comparisons: 0, rotations: 0, count: 2, snap: two[two.length - 1].snap, note: { title: '', body: '' } };
      const track = [loaded, ...t.insert(keys[2])];
      const frames = track.map((e, i) => ({ frame: story(track, i).frame, dur: TILE_DUR[e.type] || 420 }));
      frames[0].frame.stagger = true;
      const view = new TreeView($('.rot-svg', tile), { maxR: 26, minR: 13, maxCol: 84, maxLevel: 70, top: 0.16, bottom: 0.1 });
      view.setSpeed(1.1);
      /* every tile starts on its first two keys, never on an empty pane */
      view.show(frames[0].frame);
      if (reduceMotion.matches) { view.show(frames[frames.length - 1].frame); return; }
      let i = 1, timer = 0, running = false;
      const step = () => {
        if (i < frames.length) { const f = frames[i++]; view.show(f.frame); timer = setTimeout(step, f.dur); return; }
        /* rewind: the third key leaves and the first two slide back to where they started */
        view.show(frames[0].frame);
        i = 1; timer = setTimeout(step, 1200);
      };
      gate(tile, (on) => {
        if (on && !running) { running = true; timer = setTimeout(step, i > 1 ? 0 : 400 + n * 380); }
        else if (!on && running) { running = false; clearTimeout(timer); }
      });
    });
  }

  /* ---------- 5. how tall: height against keys, on a log scale ---------- */

  function initChart() {
    const svg = $('#cx-svg'), range = $('#cx-n');
    if (!svg || !range) return;
    const NS = 'http://www.w3.org/2000/svg';
    const fmt = new Intl.NumberFormat('en');
    const YMAX = 40, XMAX = 6;
    const bound = (n) => 1.4405 * Math.log2(n + 2) - 0.3277;   // the tallest an AVL tree can be
    const perfect = (n) => Math.log2(n + 1);
    let W = 0, H = 0, M = null, parts = null;
    const el = (name, attrs, parent) => {
      const node = document.createElementNS(NS, name);
      for (const k in attrs) node.setAttribute(k, attrs[k]);
      (parent || svg).appendChild(node);
      return node;
    };
    const X = (lg) => M.l + (lg / XMAX) * (W - M.l - M.r);
    const Y = (h) => M.t + (1 - Math.min(h, YMAX) / YMAX) * (H - M.t - M.b);
    const curve = (fn, to) => {
      let d = '';
      for (let s = 0; s <= 200; s++) { const lg = (to * s) / 200; d += (s ? 'L' : 'M') + X(lg).toFixed(1) + ' ' + Y(fn(Math.pow(10, lg))).toFixed(1); }
      return d;
    };
    const text = (cls, x, y, str, anchor) => { const n = el('text', { class: cls, x, y, 'text-anchor': anchor || 'start', 'dominant-baseline': 'central' }); n.textContent = str; return n; };

    const draw = () => {
      const box = svg.getBoundingClientRect();
      W = Math.round(box.width); H = Math.round(box.height);
      if (!W || !H) return;
      const small = W < 520;
      M = { l: small ? 28 : 40, r: small ? 10 : 18, t: 30, b: 34 };
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.replaceChildren();
      [0, 10, 20, 30, 40].forEach((h) => {
        el('line', { class: 'cx-grid-line', x1: M.l, x2: W - M.r, y1: Y(h), y2: Y(h) });
        text('cx-axis', M.l - 10, Y(h), String(h), 'end');
      });
      text('cx-axis', M.l, 10, 'levels');
      ['1', '10', '100', '1k', '10k', '100k', '1M keys'].forEach((lab, lg) => {
        if (small && lg % 2) return;
        text('cx-axis', X(lg), H - 12, lab, lg === 0 ? 'start' : lg === XMAX ? 'end' : 'middle');
      });

      const avl = curve(bound, XMAX);
      el('path', { class: 'cx-area', d: avl + 'L' + X(XMAX) + ' ' + Y(0) + 'L' + X(0) + ' ' + Y(0) + 'Z' });
      el('path', { class: 'cx-curve cx-curve--best', d: curve(perfect, XMAX) });
      el('path', { class: 'cx-curve cx-curve--avl', d: avl });
      const top = Math.log10(YMAX);
      el('path', { class: 'cx-curve cx-curve--bst', d: curve((n) => n, top) });
      const bx = X(top), by = Y(YMAX);
      el('path', { d: 'M' + (bx - 7) + ' ' + (by + 9) + 'L' + bx + ' ' + (by - 2) + 'L' + (bx + 7) + ' ' + (by + 9), class: 'cx-arrow' });
      text('cx-tag cx-tag--bst', bx + 14, by + 6, small ? 'BST' : 'plain BST: off the chart');
      text('cx-tag cx-tag--avl', X(XMAX), Y(bound(1e6)) - 16, 'AVL', 'end');
      text('cx-tag cx-tag--best', X(XMAX), Y(perfect(1e6)) + 18, 'perfect', 'end');

      parts = {
        cursor: el('line', { class: 'cx-cursor' }),
        bst: el('circle', { class: 'cx-dot cx-dot--bst', r: 6 }),
        best: el('circle', { class: 'cx-dot cx-dot--best', r: 5 }),
        avl: el('circle', { class: 'cx-dot cx-dot--avl', r: 6 })
      };
      update();
    };

    const update = () => {
      const lg = +range.value;
      const n = Math.max(1, Math.round(Math.pow(10, lg)));
      $('#cx-n-out').textContent = fmt.format(n);
      $('#cx-avl').textContent = fmt.format(worstAvl(n));
      $('#cx-perfect').textContent = fmt.format(perfectHeight(n));
      $('#cx-bst').textContent = fmt.format(n);
      range.setAttribute('aria-valuetext', fmt.format(n) + ' keys');
      range.style.setProperty('--p', (lg / XMAX) * 100 + '%');
      if (!parts) return;
      const x = X(lg);
      parts.cursor.setAttribute('x1', x); parts.cursor.setAttribute('x2', x);
      parts.cursor.setAttribute('y1', M.t); parts.cursor.setAttribute('y2', Y(0));
      const at = (c, h) => { c.setAttribute('cx', x); c.setAttribute('cy', Y(h)); };
      at(parts.avl, bound(n)); at(parts.best, perfect(n)); at(parts.bst, n);
      parts.bst.setAttribute('opacity', n > YMAX ? '0' : '1');
    };

    range.addEventListener('input', update);
    /* the chart itself is a slider too */
    const fromPointer = (ev) => {
      if (!M) return;
      const r = svg.getBoundingClientRect();
      const lg = ((ev.clientX - r.left - M.l) / (W - M.l - M.r)) * XMAX;
      range.value = String(Math.max(0, Math.min(XMAX, lg)));
      update();
    };
    svg.addEventListener('pointerdown', (ev) => { svg.setPointerCapture(ev.pointerId); fromPointer(ev); });
    svg.addEventListener('pointermove', (ev) => { if (svg.hasPointerCapture(ev.pointerId)) fromPointer(ev); });
    new ResizeObserver(draw).observe(svg);
    update();
  }

  /* ---------- tabs and the check button ---------- */

  function initTabs() {
    const tabs = $$('[role="tab"]');
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (ev) => {
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
          ev.preventDefault();
          select(tabs[(i + (ev.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length], true);
        }
      });
    });

    const verify = $('#hood-verify'), out = $('#hood-verify-out');
    if (verify) verify.addEventListener('click', () => {
      if (!vz.tree) return;
      const n = vz.tree.count(), h = vz.tree.height(), ok = vz.tree.valid();
      out.textContent = ok
        ? 'avl_check(): valid. ' + plural(n, 'key') + ', height ' + h + ', keys in order, every balance within ' + MINUS + '1 to +1.'
        : 'avl_check() found a broken invariant. That should never happen; please report it.';
      out.classList.remove('is-in'); void out.offsetWidth; out.classList.add('is-in');
    });

    $$('[data-watch]').forEach((b) => b.addEventListener('click', () => watch(b.dataset.watch)));
  }

  /* ---------- the footer mark: avl in dots, five by seven ---------- */

  const GLYPHS = {
    a: ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####'],
    v: ['.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    l: ['.##..', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.']
  };

  function initMark() {
    const svg = $('#mark');
    if (!svg) return;
    const NS = 'http://www.w3.org/2000/svg';
    const word = 'avl', cols = word.length * 6 - 1, rows = 7, cell = 10;
    svg.setAttribute('viewBox', '0 0 ' + cols * cell + ' ' + rows * cell);
    const dots = [];
    [...word].forEach((ch, li) => {
      GLYPHS[ch].forEach((row, y) => {
        [...row].forEach((c, x) => {
          const d = document.createElementNS(NS, 'circle');
          const cx = (li * 6 + x) * cell + cell / 2, cy = y * cell + cell / 2;
          d.setAttribute('cx', cx); d.setAttribute('cy', cy); d.setAttribute('r', cell * 0.42);
          d.setAttribute('class', c === '#' ? 'on' : 'off');
          d.style.transformOrigin = cx + 'px ' + cy + 'px';
          svg.appendChild(d);
          dots.push({ el: d, x: cx, y: cy, s: 1 });
        });
      });
    });
    if (reduceMotion.matches || !window.matchMedia('(hover: hover)').matches) return;
    let raf = 0, px = -1e4, py = -1e4;
    const paint = () => {
      raf = 0;
      for (const d of dots) {
        const dist = Math.hypot(d.x - px, d.y - py);
        const s = 1 + 0.5 * Math.max(0, 1 - dist / (cell * 3.2));
        if (Math.abs(s - d.s) > 0.004) { d.s = s; d.el.style.transform = s === 1 ? '' : 'scale(' + s.toFixed(3) + ')'; }
      }
    };
    svg.addEventListener('pointermove', (ev) => {
      const r = svg.getBoundingClientRect();
      px = ((ev.clientX - r.left) / r.width) * cols * cell;
      py = ((ev.clientY - r.top) / r.height) * rows * cell;
      if (!raf) raf = requestAnimationFrame(paint);
    });
    svg.addEventListener('pointerleave', () => { px = py = -1e4; if (!raf) raf = requestAnimationFrame(paint); });
  }

  /* ---------- reveals ---------- */

  function initReveals() {
    const els = $$('.reveal, .shutter');
    if (!('IntersectionObserver' in window) || reduceMotion.matches) { els.forEach((el) => el.classList.add('is-in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    els.forEach((el) => io.observe(el));
    requestAnimationFrame(() => document.documentElement.classList.add('is-ready'));
  }

  function init() {
    initReveals();
    initTabs();
    initChart();
    initMark();
    const top = $('#to-top');
    if (top) top.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' }));
    Promise.all([initHero(), initVisualiser(), initRace(), initRotations()]).catch((err) => {
      console.error(err);
      const msg = $('#vz-note');
      if (msg) { msg.textContent = 'The C module could not start in this browser: ' + err.message; msg.classList.add('is-bad'); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
