/* Native tests for src/avl.c: the four rotation cases, delete with two children,
 * search, traversals, duplicates, capacity, and 20,000 random operations checked
 * against a plain array. Build and run with build.ps1. */
#include <stdio.h>
#include <stdlib.h>

int avl_insert(int key);
int avl_delete(int key);
int avl_search(int key);
int avl_traverse(int kind);
int *avl_output(void);
int *avl_events(void);
int avl_event_width(void);
int avl_capacity(void);
int avl_count(void);
int avl_height(void);
int avl_check(void);
void avl_reset(void);

static int failures = 0, checks = 0;
#define EXPECT(cond, ...) do { checks++; if (!(cond)) { failures++; printf("  FAIL line %d: ", __LINE__); printf(__VA_ARGS__); printf("\n"); } } while (0)

/* the last event of an operation is EV_DONE: a = op, b = result, c = comparisons, d = rotations */
static int *last_event(int n) { return avl_events() + (n - 1) * avl_event_width(); }

static void expect_order(int kind, const int *want, int len, const char *name) {
    int n = avl_traverse(kind);
    int ok = n == len;
    for (int i = 0; ok && i < n; i++) ok = avl_output()[i] == want[i];
    EXPECT(ok, "%s order is wrong", name);
}

static void case_rotation(const char *name, int a, int b, int c, int want_rotations) {
    avl_reset();
    avl_insert(a); avl_insert(b);
    int n = avl_insert(c);
    int *done = last_event(n);
    int pre[3] = { 20, 10, 30 };
    EXPECT(done[4] == want_rotations, "%s: %d rotations, expected %d", name, done[4], want_rotations);
    EXPECT(avl_check(), "%s: tree is not a valid AVL tree", name);
    EXPECT(avl_height() == 2, "%s: height %d, expected 2", name, avl_height());
    expect_order(1, pre, 3, name);
}

int main(void) {
    printf("AVL tree tests\n");

    case_rotation("left-left  (30, 20, 10)", 30, 20, 10, 1);
    case_rotation("right-right(10, 20, 30)", 10, 20, 30, 1);
    case_rotation("left-right (30, 10, 20)", 30, 10, 20, 2);
    case_rotation("right-left (10, 30, 20)", 10, 30, 20, 2);

    /* the textbook sequence */
    avl_reset();
    int seq[] = { 50, 20, 70, 10, 30, 60, 80, 25, 35, 5 };
    for (int i = 0; i < 10; i++) avl_insert(seq[i]);
    EXPECT(avl_check(), "sequence: invalid tree");
    int in[] = { 5, 10, 20, 25, 30, 35, 50, 60, 70, 80 };
    expect_order(0, in, 10, "in-order");
    int lvl[] = { 50, 20, 70, 10, 30, 60, 80, 5, 25, 35 };
    expect_order(3, lvl, 10, "level-order");

    /* duplicates are refused */
    int n = avl_insert(30);
    EXPECT(last_event(n)[2] == 0 && avl_count() == 10, "duplicate 30 was inserted");

    /* search */
    n = avl_search(35);
    EXPECT(last_event(n)[2] == 1 && last_event(n)[3] == 4, "search 35: found=%d after %d comparisons", last_event(n)[2], last_event(n)[3]);
    n = avl_search(36);
    EXPECT(last_event(n)[2] == 0, "search 36 should miss");

    /* delete a node with two children (20 -> successor 25), then a leaf that forces a rotation */
    n = avl_delete(20);
    EXPECT(last_event(n)[2] == 1 && avl_check(), "delete 20 failed");
    int in2[] = { 5, 10, 25, 30, 35, 50, 60, 70, 80 };
    expect_order(0, in2, 9, "after delete 20");
    avl_delete(60); avl_delete(80);
    EXPECT(avl_check(), "delete 60, 80 left an unbalanced tree");
    n = avl_delete(999);
    EXPECT(last_event(n)[2] == 0 && avl_count() == 7, "deleting a missing key changed the tree");

    /* capacity */
    avl_reset();
    for (int i = 1; i <= avl_capacity(); i++) avl_insert(i);
    EXPECT(avl_count() == avl_capacity() && avl_check(), "filling the tree failed");
    EXPECT(avl_height() == 5, "31 sorted keys should give height 5, got %d", avl_height());
    n = avl_insert(1000);
    EXPECT(last_event(n)[2] == -1, "insert into a full tree should report -1");

    /* random operations against a reference set */
    srand(7);
    int present[100] = { 0 }, size = 0, max_height = 0;
    avl_reset();
    for (int i = 0; i < 20000; i++) {
        int key = rand() % 100, op = rand() % 3;
        if (op == 0 && size < avl_capacity()) {
            n = avl_insert(key);
            EXPECT(last_event(n)[2] == (present[key] ? 0 : 1), "random insert %d", key);
            if (!present[key]) { present[key] = 1; size++; }
        } else if (op == 1) {
            n = avl_delete(key);
            EXPECT(last_event(n)[2] == present[key], "random delete %d", key);
            if (present[key]) { present[key] = 0; size--; }
        } else {
            n = avl_search(key);
            EXPECT(last_event(n)[2] == present[key], "random search %d", key);
        }
        if (!avl_check() || avl_count() != size) { EXPECT(0, "invariant broken at step %d", i); break; }
        if (avl_height() > max_height) max_height = avl_height();
    }
    /* an AVL tree of n <= 31 keys has height at most 1.44 log2(n + 2), i.e. 7 */
    EXPECT(max_height <= 7, "height reached %d", max_height);

    printf("%d checks, %d failed (largest height seen in the random run: %d)\n", checks, failures, max_height);
    return failures ? 1 : 0;
}
