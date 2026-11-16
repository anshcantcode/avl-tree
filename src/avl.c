/*
 * avl.c - an AVL tree that records every step it takes.
 *
 * The same file is compiled two ways:
 *   - to WebAssembly (build.ps1); the web page loads it and calls it directly,
 *     so the C code is the backend that runs every operation;
 *   - to a native program together with test/test_avl.c, which runs the tests.
 *
 * Nodes live in a fixed pool, so the code needs no malloc and no libc.
 * Every moment worth showing (a comparison, a new leaf, a height update,
 * an imbalance, a rotation...) is written to an event buffer together with a
 * full snapshot of the tree, and the page animates from snapshot to snapshot.
 */

#ifdef __wasm__
#define EXPORT(name) __attribute__((export_name(name)))
#else
#define EXPORT(name)
#endif

#define MAXN 31               /* largest tree the page can draw clearly (a perfect tree of height 5) */
#define MAXEV 256             /* events one operation may record          */
#define NIL (-1)
#define HDR 8                 /* type, a, b, c, d, comparisons, rotations, count */
#define SNAP (1 + MAXN * 5)   /* root, then key,left,right,height,used for every slot */
#define EVW (HDR + SNAP)

enum {
    EV_START = 1,     /* a = op, b = key                                       */
    EV_COMPARE,       /* a = node, b = key, c = -1 go left / 1 go right / 0 equal */
    EV_PLACE,         /* a = new node, b = parent, c = side (-1 / 1, 0 = root)  */
    EV_DUPLICATE,     /* a = node, b = key                                     */
    EV_HEIGHT,        /* a = node, b = new height, c = balance factor          */
    EV_IMBALANCE,     /* a = node, b = balance factor, c = case                */
    EV_ROTATE_RIGHT,  /* a = new subtree root, b = old subtree root, c = stage  */
    EV_ROTATE_LEFT,   /* a = new subtree root, b = old subtree root, c = stage  */
    EV_FOUND,         /* a = node, b = key                                     */
    EV_NOT_FOUND,     /* a = last node visited, b = key, c = side              */
    EV_SUCCESSOR,     /* a = node on the walk to the in-order successor        */
    EV_COPY,          /* a = target node, b = successor node, c = new key, d = old key */
    EV_REMOVE,        /* a = removed node, b = key, c = child that takes its place */
    EV_FULL,          /* a = capacity                                          */
    EV_DONE           /* a = op, b = result, c = comparisons, d = rotations    */
};

enum { OP_INSERT = 1, OP_DELETE, OP_SEARCH };
enum { CASE_LL = 1, CASE_RR, CASE_LR, CASE_RL };
/* stage of a rotation: 0 = single rotation, 1 = first half of a double, 2 = second half */

typedef struct { int key, left, right, height, used; } Node;

static Node node[MAXN];
static int root = NIL;
static int count = 0;
static int ev[MAXEV * EVW];
static int nev = 0;
static int comparisons = 0, rotations = 0;
static int stop = 0;          /* set when an insert meets a duplicate or a delete misses */
static int out[MAXN];
static int nout = 0;

/* ---------- helpers ---------- */

static int max2(int a, int b) { return a > b ? a : b; }
static int height(int n) { return n == NIL ? 0 : node[n].height; }
static void update_height(int n) { node[n].height = 1 + max2(height(node[n].left), height(node[n].right)); }
static int bf(int n) { return n == NIL ? 0 : height(node[n].left) - height(node[n].right); }

static void emit(int type, int a, int b, int c, int d) {
    if (type != EV_DONE && nev >= MAXEV - 1) return;   /* the last slot is kept for EV_DONE */
    int *e = ev + nev * EVW;
    e[0] = type; e[1] = a; e[2] = b; e[3] = c; e[4] = d;
    e[5] = comparisons; e[6] = rotations; e[7] = count;
    int *s = e + HDR;
    s[0] = root;
    for (int i = 0; i < MAXN; i++) {
        int *p = s + 1 + i * 5;
        p[0] = node[i].key; p[1] = node[i].left; p[2] = node[i].right;
        p[3] = node[i].height; p[4] = node[i].used;
    }
    nev++;
}

static int new_node(int key) {
    for (int i = 0; i < MAXN; i++) {
        if (!node[i].used) {
            node[i].key = key; node[i].left = NIL; node[i].right = NIL;
            node[i].height = 1; node[i].used = 1;
            return i;
        }
    }
    return NIL;
}

/* ---------- rotations ---------- */

/*        y              x
 *       / \            / \
 *      x   C   --->   A   y
 *     / \                / \
 *    A   B              B   C        rotate_right(y); rotate_left is the mirror */
static int rotate_right(int y) {
    int x = node[y].left;
    node[y].left = node[x].right;
    node[x].right = y;
    update_height(y);
    update_height(x);
    rotations++;
    return x;
}

static int rotate_left(int x) {
    int y = node[x].right;
    node[x].right = node[y].left;
    node[y].left = x;
    update_height(x);
    update_height(y);
    rotations++;
    return y;
}

/* *link is the pointer that holds this subtree: root, or a parent's left/right. */
static void rebalance(int *link) {
    int n = *link;
    int b = bf(n);
    if (b > 1) {
        int c = node[n].left;
        if (bf(c) >= 0) {                                   /* left-left: one right rotation */
            emit(EV_IMBALANCE, n, b, CASE_LL, 0);
            *link = rotate_right(n);
            emit(EV_ROTATE_RIGHT, *link, n, 0, 0);
        } else {                                            /* left-right: left, then right */
            emit(EV_IMBALANCE, n, b, CASE_LR, 0);
            node[n].left = rotate_left(c);
            emit(EV_ROTATE_LEFT, node[n].left, c, 1, 0);
            *link = rotate_right(n);
            emit(EV_ROTATE_RIGHT, *link, n, 2, 0);
        }
    } else if (b < -1) {
        int c = node[n].right;
        if (bf(c) <= 0) {                                   /* right-right: one left rotation */
            emit(EV_IMBALANCE, n, b, CASE_RR, 0);
            *link = rotate_left(n);
            emit(EV_ROTATE_LEFT, *link, n, 0, 0);
        } else {                                            /* right-left: right, then left */
            emit(EV_IMBALANCE, n, b, CASE_RL, 0);
            node[n].right = rotate_right(c);
            emit(EV_ROTATE_RIGHT, node[n].right, c, 1, 0);
            *link = rotate_left(n);
            emit(EV_ROTATE_LEFT, *link, n, 2, 0);
        }
    }
}

/* ---------- insert ---------- */

static void insert_at(int *link, int parent, int side, int key) {
    int n = *link;
    if (n == NIL) {
        int id = new_node(key);
        *link = id;
        count++;
        emit(EV_PLACE, id, parent, side, 0);
        return;
    }
    comparisons++;
    if (key < node[n].key) {
        emit(EV_COMPARE, n, key, -1, 0);
        insert_at(&node[n].left, n, -1, key);
    } else if (key > node[n].key) {
        emit(EV_COMPARE, n, key, 1, 0);
        insert_at(&node[n].right, n, 1, key);
    } else {
        emit(EV_COMPARE, n, key, 0, 0);
        emit(EV_DUPLICATE, n, key, 0, 0);
        stop = 1;
        return;
    }
    if (stop) return;
    update_height(n);                                       /* unwinding: fix heights bottom-up */
    emit(EV_HEIGHT, n, node[n].height, bf(n), 0);
    rebalance(link);
}

/* ---------- delete ---------- */

static void delete_at(int *link, int key, int last, int side) {
    int n = *link;
    if (n == NIL) {
        emit(EV_NOT_FOUND, last, key, side, 0);
        stop = 1;
        return;
    }
    comparisons++;
    if (key < node[n].key) {
        emit(EV_COMPARE, n, key, -1, 0);
        delete_at(&node[n].left, key, n, -1);
    } else if (key > node[n].key) {
        emit(EV_COMPARE, n, key, 1, 0);
        delete_at(&node[n].right, key, n, 1);
    } else {
        emit(EV_COMPARE, n, key, 0, 0);
        emit(EV_FOUND, n, key, 0, 0);
        if (node[n].left == NIL || node[n].right == NIL) {  /* zero or one child: splice it out */
            int child = node[n].left != NIL ? node[n].left : node[n].right;
            *link = child;
            node[n].used = 0;
            count--;
            emit(EV_REMOVE, n, key, child, 0);
            return;
        }
        /* two children: take the smallest key of the right subtree */
        int s = node[n].right;
        emit(EV_SUCCESSOR, s, node[s].key, 0, 0);
        while (node[s].left != NIL) {
            s = node[s].left;
            emit(EV_SUCCESSOR, s, node[s].key, 0, 0);
        }
        int old = node[n].key;
        node[n].key = node[s].key;
        emit(EV_COPY, n, s, node[s].key, old);
        delete_at(&node[n].right, node[s].key, n, 1);
    }
    if (stop) return;
    update_height(n);
    emit(EV_HEIGHT, n, node[n].height, bf(n), 0);
    rebalance(link);
}

/* ---------- traversals ---------- */

static void inorder(int n)   { if (n == NIL) return; inorder(node[n].left); out[nout++] = node[n].key; inorder(node[n].right); }
static void preorder(int n)  { if (n == NIL) return; out[nout++] = node[n].key; preorder(node[n].left); preorder(node[n].right); }
static void postorder(int n) { if (n == NIL) return; postorder(node[n].left); postorder(node[n].right); out[nout++] = node[n].key; }
static void levelorder(void) {
    int queue[MAXN], head = 0, tail = 0;
    if (root != NIL) queue[tail++] = root;
    while (head < tail) {
        int n = queue[head++];
        out[nout++] = node[n].key;
        if (node[n].left != NIL) queue[tail++] = node[n].left;
        if (node[n].right != NIL) queue[tail++] = node[n].right;
    }
}

/* ---------- exported interface ---------- */

static void begin(int op, int key) {
    nev = 0; comparisons = 0; rotations = 0; stop = 0;
    emit(EV_START, op, key, 0, 0);
}

EXPORT("avl_reset") void avl_reset(void) {
    for (int i = 0; i < MAXN; i++) { node[i].used = 0; node[i].left = node[i].right = NIL; node[i].height = 0; node[i].key = 0; }
    root = NIL; count = 0; nev = 0;
}

/* result in EV_DONE.b: 1 inserted, 0 duplicate, -1 tree full. Returns the event count. */
EXPORT("avl_insert") int avl_insert(int key) {
    begin(OP_INSERT, key);
    int result = 1;
    if (count >= MAXN) { emit(EV_FULL, MAXN, 0, 0, 0); result = -1; }
    else { insert_at(&root, NIL, 0, key); if (stop) result = 0; }
    emit(EV_DONE, OP_INSERT, result, comparisons, rotations);
    return nev;
}

/* result: 1 deleted, 0 not found */
EXPORT("avl_delete") int avl_delete(int key) {
    begin(OP_DELETE, key);
    delete_at(&root, key, NIL, 0);
    emit(EV_DONE, OP_DELETE, stop ? 0 : 1, comparisons, rotations);
    return nev;
}

/* result: 1 found, 0 not found. Iterative, so it uses O(1) extra space. */
EXPORT("avl_search") int avl_search(int key) {
    begin(OP_SEARCH, key);
    int n = root, last = NIL, side = 0, found = 0;
    while (n != NIL) {
        comparisons++;
        if (key == node[n].key) { emit(EV_COMPARE, n, key, 0, 0); emit(EV_FOUND, n, key, 0, 0); found = 1; break; }
        side = key < node[n].key ? -1 : 1;
        emit(EV_COMPARE, n, key, side, 0);
        last = n;
        n = side < 0 ? node[n].left : node[n].right;
    }
    if (!found) emit(EV_NOT_FOUND, last, key, side, 0);
    emit(EV_DONE, OP_SEARCH, found, comparisons, rotations);
    return nev;
}

/* kind: 0 in-order, 1 pre-order, 2 post-order, 3 level-order. Returns how many keys are in out[]. */
EXPORT("avl_traverse") int avl_traverse(int kind) {
    nout = 0;
    if (kind == 0) inorder(root);
    else if (kind == 1) preorder(root);
    else if (kind == 2) postorder(root);
    else levelorder();
    return nout;
}

EXPORT("avl_output") int *avl_output(void) { return out; }
EXPORT("avl_events") int *avl_events(void) { return ev; }
EXPORT("avl_event_count") int avl_event_count(void) { return nev; }
EXPORT("avl_event_width") int avl_event_width(void) { return EVW; }
EXPORT("avl_header_width") int avl_header_width(void) { return HDR; }
EXPORT("avl_capacity") int avl_capacity(void) { return MAXN; }
EXPORT("avl_count") int avl_count(void) { return count; }
EXPORT("avl_height") int avl_height(void) { return height(root); }

/* Checks every invariant: BST order, stored heights, balance factors in [-1, 1].
 * Returns 1 when the tree is a valid AVL tree. Used by the tests. */
static int check_ok;
static int check(int n, long long lo, long long hi) {
    if (n == NIL) return 0;
    if (node[n].key <= lo || node[n].key >= hi) check_ok = 0;
    int hl = check(node[n].left, lo, node[n].key);
    int hr = check(node[n].right, node[n].key, hi);
    if (node[n].height != 1 + max2(hl, hr)) check_ok = 0;
    if (hl - hr > 1 || hr - hl > 1) check_ok = 0;
    return 1 + max2(hl, hr);
}

EXPORT("avl_check") int avl_check(void) {
    check_ok = 1;
    check(root, -2147483649LL, 2147483648LL);
    return check_ok;
}
