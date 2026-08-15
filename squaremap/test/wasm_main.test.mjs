/**
 * wasm_main.test.mjs (squaremap)
 * ----------------------------------------------------------------
 * Node test harness for the pure-JS port of the rust/wasm geometry
 * module. Run from the squaremap/ directory:
 *
 *     node test/wasm_main.test.mjs
 *
 * The border buffer format checked here is the one consumed by
 * nodes.js _getTerritoryBorder():
 *   [coreX, coreY, N, n1, e1, chunk coords..., edge coords..., ...]
 */

import { World, IndexSampler } from "../src/wasm_main.js";

let passed = 0;
let failed = 0;

function assert(cond, msg) {
    if (cond) {
        passed += 1;
        // console.log(`  ok: ${msg}`);
    } else {
        failed += 1;
        console.error(`  FAIL: ${msg}`);
    }
}

function assertDeepEqual(actual, expected, msg) {
    const a = Array.from(actual);
    const e = Array.from(expected);
    if (a.length !== e.length || a.some((v, i) => v !== e[i])) {
        failed += 1;
        console.error(`  FAIL: ${msg}`);
        console.error(`    actual:   [${a.join(", ")}]`);
        console.error(`    expected: [${e.join(", ")}]`);
    } else {
        passed += 1;
    }
}

// helper: fill a rectangle of chunks into a territory
function addRect(world, id, x0, z0, w, h) {
    const coords = [];
    for (let x = x0; x < x0 + w; x++) {
        for (let z = z0; z < z0 + h; z++) {
            coords.push(x, z);
        }
    }
    return world.addCoordsToTerritory(id, coords);
}

// helper: parse a border buffer like nodes.js does
function parseBorder(buffer) {
    const core = { x: buffer[0], y: buffer[1] };
    const numClusters = buffer[2];
    const borders = [];
    let off = 3;
    for (let i = 0; i < numClusters; i++) {
        const numChunks = buffer[off];
        const edgeLoopPoints = buffer[off + 1];
        borders.push({
            numChunks,
            numEdgeLoopPoints: edgeLoopPoints,
            chunks: buffer.subarray(off + 2, off + 2 + 2 * numChunks),
            edge: buffer.subarray(off + 2 + 2 * numChunks, off + 2 + 2 * numChunks + 2 * edgeLoopPoints),
        });
        off = off + 2 + 2 * numChunks + 2 * edgeLoopPoints;
    }
    return { core, numClusters, borders };
}

function isClosedLoop(edge) {
    return edge.length >= 4 && edge[0] === edge[edge.length - 2] && edge[1] === edge[edge.length - 1];
}

console.log("== World basic ops ==");
{
    const w = new World(16);
    assert(w.getTerritoryIdCounter() === 0, "id counter starts at 0");
    const id = w.createTerritory();
    assert(id === 0, "first auto id is 0");
    assert(w.createTerritory(5) === 5, "explicit id honored");
    assert(w.getTerritoryIdCounter() === 1, "explicit id does not advance counter");
    assert(w.getNewTerritoryId() === 1, "getNewTerritoryId returns counter");
    assert(w.getTerritorySize(id) === 0, "empty territory size 0");
    assert(w.addCoordsToTerritory(id, [0, 0, 1, 0, 0, 1]) === true, "add coords ok");
    assert(w.getTerritorySize(id) === 3, "size 3 after add");
    const chunks = w.getTerritoryChunksBuffer(id);
    assertDeepEqual(chunks.sort((a, b) => a - b), [0, 0, 0, 0, 1, 1], "chunks buffer round trip");
    assert(w.addCoordsToTerritory(id, [0, 0]) === true, "duplicate coord add is ok");
    assert(w.getTerritorySize(id) === 3, "duplicate does not grow size");
    w.removeCoords([0, 0]);
    assert(w.getTerritorySize(id) === 2, "removeCoords shrinks territory");
    assert(w.getTerritorySize(99) === undefined, "missing territory size undefined");
}

console.log("== Border: single chunk ==");
{
    const w = new World(16);
    const id = w.createTerritory();
    w.addCoordsToTerritory(id, [0, 0]);
    const buffer = w.getTerritoryBorder(id);
    assert(buffer instanceof Int32Array, "border returns Int32Array (nodes.js uses .subarray)");
    // core at chunk center (8,8); 1 cluster; 1 border chunk; 5-point closed square loop
    assertDeepEqual(
        buffer,
        [8, 8, 1, 1, 5, 0, 0, 0, 0, 16, 0, 16, 16, 0, 16, 0, 0],
        "single chunk border buffer"
    );
    const parsed = parseBorder(buffer);
    assert(parsed.numClusters === 1, "single chunk: 1 cluster");
    assert(parsed.borders[0].numChunks === 1, "single chunk: 1 border chunk");
    assert(isClosedLoop(parsed.borders[0].edge), "single chunk: closed loop");
    assert(parsed.core.x === 8 && parsed.core.y === 8, "single chunk core at (8,8)");
}

console.log("== Border: 2x2 square ==");
{
    const w = new World(16);
    const id = w.createTerritory();
    addRect(w, id, 0, 0, 2, 2);
    const buffer = w.getTerritoryBorder(id);
    const parsed = parseBorder(buffer);
    assert(parsed.numClusters === 1, "2x2: 1 cluster");
    assert(parsed.borders[0].numChunks === 4, "2x2: 4 border chunks");
    assert(parsed.borders[0].edge.length === 18, "2x2: 9 edge points (8 corners/midpoints + closing)");
    const edge = Array.from(parsed.borders[0].edge);
    assert(isClosedLoop(edge), "2x2: loop closed");
    // all edge coords on the 16-block lattice and within [0, 32]
    let allOnLattice = true;
    for (const v of edge) {
        if (v % 16 !== 0 || v < 0 || v > 32) allOnLattice = false;
    }
    assert(allOnLattice, "2x2: edge coords on 16-lattice in [0,32]");
    // perimeter point set (dedup consecutive) should be 8 distinct lattice points
    const pts = [];
    for (let i = 0; i < edge.length; i += 2) {
        pts.push(`${edge[i]},${edge[i + 1]}`);
    }
    assert(pts.length === 9 && pts[0] === pts[pts.length - 1], "2x2: closed 9-point perimeter");
    const distinct = new Set(pts);
    assert(distinct.size === 8, "2x2: 8 distinct perimeter points");
}

console.log("== Border: 3x3 ring (hole) ==");
{
    const w = new World(16);
    const id = w.createTerritory();
    addRect(w, id, 0, 0, 3, 3);
    w.removeCoords([1, 1]); // hole in the middle
    assert(w.getTerritorySize(id) === 8, "ring size 8");
    const buffer = w.getTerritoryBorder(id);
    const parsed = parseBorder(buffer);

    // NOTE: this mirrors the rust wasm exactly: the 8 border chunks form a
    // single connected cluster, and join_edge_loops keeps only ONE loop per
    // cluster (the last one popped). For this shape the surviving loop is the
    // hole square. The plugin-side Java TerritoryOutline renders holes
    // properly; the editor preview matches the rust wasm.
    assert(parsed.numClusters === 1, "ring: 1 cluster (rust behavior)");
    assert(parsed.borders.length === 1, "ring: 1 border loop (rust behavior)");
    assert(parsed.borders[0].numChunks === 8, "ring: all 8 border chunks");
    assert(isClosedLoop(parsed.borders[0].edge), "ring: loop closed");
    const edge = Array.from(parsed.borders[0].edge);
    assert(edge.length === 10, "ring: 5-point hole loop");
    // hole spans blocks [16,32]x[16,32]; every edge coord inside it
    let inHole = true;
    for (let i = 0; i < edge.length; i += 2) {
        if (edge[i] < 16 || edge[i] > 32 || edge[i + 1] < 16 || edge[i + 1] > 32) inHole = false;
    }
    assert(inHole, "ring: surviving loop is the hole square");
}

console.log("== Border: empty territory ==");
{
    const w = new World(16);
    const id = w.createTerritory();
    assertDeepEqual(w.getTerritoryBorder(id), [0, 0, 0], "empty border [0,0,0]");
}

console.log("== Circle add/remove ==");
{
    const w = new World(16);
    const id = w.createTerritory();
    // radius 2 -> gx,gy in [-2,2] with hypot < 2 -> 9 chunks
    assert(w.addCircleToTerritory(id, 0, 0, 2) === true, "add circle ok");
    assert(w.getTerritorySize(id) === 9, "circle radius 2 = 9 chunks");
    assert(w.addCircleToTerritory(id, 0, 0, 0) === false, "radius 0 rejected");
    assert(w.addCircleToTerritory(id, 0, 0, -1) === false, "negative radius rejected");
    assert(w.removeCircleToTerritory(id, 0, 0, 2) === true, "remove circle ok");
    assert(w.getTerritorySize(id) === 0, "circle removed -> size 0");
    // circle respects world occupancy
    const other = w.createTerritory();
    w.addCoordsToTerritory(other, [0, 0]);
    assert(w.addCircleToTerritory(id, 0, 0, 1) === false, "circle with only occupied chunks fails");
    assert(w.getTerritorySize(id) === 0, "no chunks added to occupied area");
}

console.log("== Neighbors / edge ==");
{
    const w = new World(16);
    const a = w.createTerritory();
    const b = w.createTerritory();
    addRect(w, a, 0, 0, 2, 1); // chunks (0,0),(1,0)
    addRect(w, b, 2, 0, 1, 1); // chunk (2,0)
    w.calculateNeighbors();
    assertDeepEqual(w.getTerritoryNeighbors(a).sort(), [b], "A neighbors B");
    assertDeepEqual(w.getTerritoryNeighbors(b).sort(), [a], "B neighbors A");
    assert(w.getTerritoryIsEdge(a) === true, "A is edge (empty neighbors)");
    assert(w.getTerritoryIsEdge(b) === true, "B is edge");
    // diagonal-only contact is NOT a neighbor
    const w2 = new World(16);
    const c1 = w2.createTerritory();
    const c2 = w2.createTerritory();
    addRect(w2, c1, 0, 0, 1, 1);
    addRect(w2, c2, 1, 1, 1, 1);
    w2.calculateNeighbors();
    assert(w2.getTerritoryNeighbors(c1).length === 0, "diagonal contact is not a neighbor");
}

console.log("== Colors (6-coloring) ==");
{
    const w = new World(16);
    // build a ring of 6 territories around a center: each adjacent to 2 others
    const ids = [];
    for (let i = 0; i < 6; i++) {
        const id = w.createTerritory();
        ids.push(id);
        addRect(w, id, 2 + i, 2, 1, 1); // line of 6
    }
    // also make a 2x2 block with a center-ish arrangement to force adjacency
    w.calculateNeighbors();
    w.generateColors();
    let valid = true;
    for (const id of ids) {
        const color = w.getTerritoryColor(id);
        if (color === undefined || color < 0 || color > 5) {
            valid = false;
            break;
        }
        for (const nid of w.getTerritoryNeighbors(id)) {
            if (nid !== id && w.getTerritoryColor(nid) === color) {
                valid = false;
                break;
            }
        }
    }
    assert(valid, "no two adjacent territories share a color");
    // every territory has a color after generateColors
    let allColored = true;
    for (const id of ids) {
        if (w.getTerritoryColor(id) === undefined) allColored = false;
    }
    assert(allColored, "all territories colored");
}

console.log("== Merge ==");
{
    const w = new World(16);
    const a = w.createTerritory();
    const b = w.createTerritory();
    addRect(w, a, 0, 0, 1, 1);
    addRect(w, b, 1, 0, 1, 1);
    const merged = w.mergeTerritories([a, b]);
    assert(merged === a, "merge returns first id");
    assert(w.getTerritorySize(a) === 2, "merged size 2");
    assert(w.getTerritoriesInAABB(-1, -1, 3, 3).includes(a), "merged territory in AABB");
    assert(w.getTerritorySize(b) === undefined, "merged-away territory gone");
    assert(w.mergeTerritories([]) === undefined, "empty merge returns undefined");
    assert(w.mergeTerritories([999]) === undefined, "missing id merge returns undefined");
}

console.log("== AABB query ==");
{
    const w = new World(16);
    const a = w.createTerritory();
    const b = w.createTerritory();
    addRect(w, a, 10, 10, 2, 2);
    addRect(w, b, 30, 30, 2, 2);
    const hits = w.getTerritoriesInAABB(0, 0, 20, 20);
    assertDeepEqual(hits.sort(), [a], "AABB only hits A");
    const hits2 = w.getTerritoriesInAABB(0, 0, 100, 100);
    assertDeepEqual(hits2.sort(), [a, b], "big AABB hits both");
}

console.log("== Subdivide ==");
{
    const w = new World(16);
    const id = w.createTerritory();
    addRect(w, id, 0, 0, 20, 20);
    const original = Array.from(w.getTerritoryChunksBuffer(id)).sort((x, y) => x - y);

    const newIds = w.subdivideIntoRandomTerritories(
        id, 6 /* avg radius */, 1, 1, 42 /* seed */, 2, 2, 0, 0
    );
    assert(Array.isArray(newIds) && newIds.length >= 3, `subdivide produced >= 3 territories (got ${newIds && newIds.length})`);
    assert(w.getTerritorySize(id) === undefined, "original territory removed");

    // union of new territories == original chunks
    const union = [];
    for (const nid of newIds) {
        union.push(...w.getTerritoryChunksBuffer(nid));
    }
    assertDeepEqual(union.sort((x, y) => x - y), original, "subdivide partition covers original exactly");

    // determinism: same seed -> same sizes
    const w2 = new World(16);
    const id2 = w2.createTerritory();
    addRect(w2, id2, 0, 0, 20, 20);
    const newIds2 = w2.subdivideIntoRandomTerritories(id2, 6, 1, 1, 42, 2, 2, 0, 0);
    const sizes1 = newIds.map((nid) => w.getTerritorySize(nid)).sort((a, b) => a - b);
    const sizes2 = newIds2.map((nid) => w2.getTerritorySize(nid)).sort((a, b) => a - b);
    assertDeepEqual(sizes1, sizes2, "same seed -> same partition sizes");

    // deleteSmallerThan skips tiny territories
    const w3 = new World(16);
    const id3 = w3.createTerritory();
    addRect(w3, id3, 0, 0, 8, 8);
    const newIds3 = w3.subdivideIntoRandomTerritories(id3, 2, 1, 1, 7, 2, 2, 4, 0);
    let allBigEnough = true;
    for (const nid of newIds3) {
        if (w3.getTerritorySize(nid) < 4) allBigEnough = false;
    }
    assert(allBigEnough, "deleteSmallerThan respected");

    // missing territory -> undefined
    assert(w.subdivideIntoRandomTerritories(999, 5, 1, 1, 1, 1, 1, 0, 0) === undefined, "subdivide missing id -> undefined");
}

console.log("== Subdivide with mergeSmallerThan ==");
{
    const w = new World(16);
    const id = w.createTerritory();
    addRect(w, id, 0, 0, 10, 10);
    const newIds = w.subdivideIntoRandomTerritories(id, 4, 1, 1, 99, 2, 2, 0, 3);
    let allLargeEnough = true;
    for (const nid of newIds) {
        if (w.getTerritorySize(nid) <= 3) allLargeEnough = false;
    }
    assert(allLargeEnough, "mergeSmallerThan leaves only territories larger than threshold");
    assert(newIds.length > 0, "subdivide with merge returns results");
}

console.log("== IndexSampler ==");
{
    // weights [1, 3, 6] -> probabilities [0.1, 0.3, 0.6]
    const sampler = IndexSampler.fromWeights(7, [1, 3, 6]);
    const counts = [0, 0, 0];
    const N = 20000;
    for (let i = 0; i < N; i++) {
        counts[sampler.sample()] += 1;
    }
    assert(Math.abs(counts[0] / N - 0.1) < 0.02, `sampler index 0 ~10% (got ${(counts[0] / N * 100).toFixed(1)}%)`);
    assert(Math.abs(counts[1] / N - 0.3) < 0.03, `sampler index 1 ~30% (got ${(counts[1] / N * 100).toFixed(1)}%)`);
    assert(Math.abs(counts[2] / N - 0.6) < 0.03, `sampler index 2 ~60% (got ${(counts[2] / N * 100).toFixed(1)}%)`);

    // determinism with same seed
    const s1 = IndexSampler.fromWeights(3, [1, 1]);
    const s2 = IndexSampler.fromWeights(3, [1, 1]);
    let same = true;
    for (let i = 0; i < 100; i++) {
        if (s1.sample() !== s2.sample()) same = false;
    }
    assert(same, "sampler deterministic for same seed");

    // zero weights allowed as long as total > 0
    const s3 = IndexSampler.fromWeights(1, [0, 1]);
    assert(s3.sample() === 1, "zero weight never sampled");
}

console.log("== greet ==");
{
    // just verify the export exists
    const mod = await import("../src/wasm_main.js");
    assert(typeof mod.greet === "function", "greet exported");
}

console.log("");
console.log(`passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
    process.exit(1);
}
