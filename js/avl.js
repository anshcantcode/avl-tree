/*
 * avl.js - the bridge between the page and the C tree.
 *
 * src/avl.c is compiled to WebAssembly by build.ps1 and embedded in js/avl-wasm.js as base64,
 * so the page also works when index.html is opened straight from disk. Every operation runs in
 * C; afterwards this file reads the C event buffer out of the module's memory and turns each
 * recorded step into a plain object { type, a, b, c, d, comparisons, rotations, count, snap }.
 */
(function () {
  'use strict';

  const EV = {
    START: 1, COMPARE: 2, PLACE: 3, DUPLICATE: 4, HEIGHT: 5, IMBALANCE: 6,
    ROTATE_RIGHT: 7, ROTATE_LEFT: 8, FOUND: 9, NOT_FOUND: 10, SUCCESSOR: 11,
    COPY: 12, REMOVE: 13, FULL: 14, DONE: 15
  };
  const OP = { INSERT: 1, DELETE: 2, SEARCH: 3 };
  const NIL = -1;

  let compiled = null;
  function compile() {
    if (!compiled) {
      const text = atob(window.AVL_WASM);
      const bytes = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
      compiled = WebAssembly.compile(bytes);
    }
    return compiled;
  }

  /* One Tree is one instance of the module, with its own memory and its own tree. */
  class Tree {
    static async create() {
      const instance = await WebAssembly.instantiate(await compile(), {});
      return new Tree(instance.exports);
    }

    constructor(exports) {
      this.x = exports;
      this.cap = exports.avl_capacity();
      this.width = exports.avl_event_width();
      this.header = exports.avl_header_width();
      exports.avl_reset();
    }

    read(n) {
      const m = new Int32Array(this.x.memory.buffer);
      const base = this.x.avl_events() >> 2;
      const out = [];
      for (let i = 0; i < n; i++) {
        const o = base + i * this.width;
        const s = o + this.header;
        const nodes = new Array(this.cap);
        for (let k = 0; k < this.cap; k++) {
          const p = s + 1 + k * 5;
          nodes[k] = { key: m[p], left: m[p + 1], right: m[p + 2], height: m[p + 3], used: m[p + 4] };
        }
        out.push({
          type: m[o], a: m[o + 1], b: m[o + 2], c: m[o + 3], d: m[o + 4],
          comparisons: m[o + 5], rotations: m[o + 6], count: m[o + 7],
          snap: { root: m[s], nodes }
        });
      }
      return out;
    }

    insert(key) { return this.read(this.x.avl_insert(key)); }
    remove(key) { return this.read(this.x.avl_delete(key)); }
    search(key) { return this.read(this.x.avl_search(key)); }

    /* kind: 0 in-order, 1 pre-order, 2 post-order, 3 level-order */
    traverse(kind) {
      const n = this.x.avl_traverse(kind);
      const p = this.x.avl_output() >> 2;
      return Array.from(new Int32Array(this.x.memory.buffer).subarray(p, p + n));
    }

    reset() { this.x.avl_reset(); }
    count() { return this.x.avl_count(); }
    height() { return this.x.avl_height(); }
    valid() { return this.x.avl_check() === 1; }
  }

  window.AVL = { Tree, EV, OP, NIL };
})();
