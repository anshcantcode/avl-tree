// Exercise the same embedded module and bridge used by the browser.
const assert = require('node:assert/strict');
global.window = global;
require('../js/avl-wasm.js');
require('../js/avl.js');

(async () => {
  const tree = await AVL.Tree.create();
  for (const keys of [[30, 20, 10], [10, 20, 30], [30, 10, 20], [10, 30, 20]]) {
    tree.reset();
    for (const key of keys) {
      const steps = tree.insert(key);
      assert.equal(steps.at(-1).type, AVL.EV.DONE);
      assert.equal(tree.valid(), true);
    }
    assert.deepEqual(tree.traverse(1), [20, 10, 30]);
    assert.equal(tree.height(), 2);
  }
  tree.insert(20);
  assert.equal(tree.count(), 3);
  assert.equal(tree.search(20).at(-1).b, 1);
  assert.equal(tree.search(99).at(-1).b, 0);
  tree.remove(20);
  assert.deepEqual(tree.traverse(0), [10, 30]);
  assert.equal(tree.valid(), true);
  const other = await AVL.Tree.create();
  assert.equal(other.count(), 0);
  assert.equal(tree.count(), 2);
  console.log('WebAssembly bridge: rotations, snapshots, search, delete, duplicates, and instance isolation passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
