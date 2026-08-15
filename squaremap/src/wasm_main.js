/**
 * wasm_main.js (squaremap)
 * ----------------------------------------------------------------
 * Pure-JS port of the rust/wasm nodes geometry module.
 *
 * This module shadows `dynmap/wasm/wasm_main.js` for the squaremap
 * webpack build (resolve.modules order: squaremap/src comes before
 * dynmap/wasm), so the squaremap editor builds and runs WITHOUT a
 * Rust toolchain. The `dynmap/` editor is untouched and still uses
 * the real wasm module.
 *
 * The exported API surface (`World`, `IndexSampler`, `greet`) and the
 * semantics of every method mirror the wasm-bindgen bindings generated
 * from `dynmap/src/lib.rs` + `dynmap/src/territory/`:
 *
 *   - `getTerritoryBorder` returns an `Int32Array` (wasm-bindgen returns
 *     `Int32Array` for `Vec<i32>`, and `nodes.js` calls `.subarray()` on it)
 *   - methods returning `Option<T>` return `undefined` for None
 *   - `getTerritoryColor` returns the graph-coloring INDEX (0..5), not a color
 *
 * Porting notes / intentional differences from the rust code:
 *   - chunk coordinates are stored as "x,y" string keys in a Map/Set
 *   - `subdivideIntoRandomTerritories` uses a discrete Lloyd relaxation
 *     (nearest-centroid over the territory chunks) instead of the
 *     voronator polygon diagram; the result is a deterministic random
 *     partition with similar smoothness, without needing a delaunay/voronoi
 *     implementation. Cell count is capped at MAX_CELLS for browser safety.
 *   - the seeded PRNG (mulberry32) does not match rand::SmallRng's output
 *     sequence; only determinism for a given seed is guaranteed.
 */

// ============================================================
// utilities
// ============================================================

// grid key for a chunk coord ("x,y")
const key = (x, y) => x + "," + y;

// deterministic seeded PRNG (mulberry32). Returns function -> [0, 1)
function createRng(seed) {
    let s = seed >>> 0;
    if (s === 0) {
        s = 0x9e3779b9;
    }
    return function () {
        s |= 0;
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// rng factory honoring an optional seed (null/undefined -> Math.random)
function rngFromSeed(seed) {
    if (seed === undefined || seed === null) {
        return Math.random;
    }
    return createRng(seed);
}

// simple binary max-heap keyed by .maxDistance (polylabel priority queue)
class MaxHeap {
    constructor() {
        this.items = [];
    }
    get size() {
        return this.items.length;
    }
    isEmpty() {
        return this.items.length === 0;
    }
    push(item) {
        const items = this.items;
        items.push(item);
        let i = items.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (items[parent].maxDistance >= items[i].maxDistance) {
                break;
            }
            const tmp = items[parent];
            items[parent] = items[i];
            items[i] = tmp;
            i = parent;
        }
    }
    pop() {
        const items = this.items;
        const top = items[0];
        const last = items.pop();
        if (items.length > 0) {
            items[0] = last;
            let i = 0;
            for (;;) {
                const l = 2 * i + 1;
                const r = l + 1;
                let largest = i;
                if (l < items.length && items[l].maxDistance > items[largest].maxDistance) {
                    largest = l;
                }
                if (r < items.length && items[r].maxDistance > items[largest].maxDistance) {
                    largest = r;
                }
                if (largest === i) {
                    break;
                }
                const tmp = items[largest];
                items[largest] = items[i];
                items[i] = tmp;
                i = largest;
            }
        }
        return top;
    }
}

// ============================================================
// polygon helpers (port of dynmap/src/territory/polygon.rs)
// ============================================================

function lineDeterminant(start, end) {
    return start.x * end.y - start.y * end.x;
}

// simple area; note: loop is NOT closed (matches rust: i in 0..len-1)
function getArea(polygon) {
    if (polygon.length === 0 || polygon.length === 1) {
        return 0;
    }
    let twiceSignedRingArea = 0;
    for (let i = 0; i < polygon.length - 1; i++) {
        twiceSignedRingArea += lineDeterminant(polygon[i], polygon[i + 1]);
    }
    return twiceSignedRingArea / 2;
}

function getCentroid(polygon) {
    if (polygon.length === 0) {
        return { x: 0, y: 0 };
    }
    if (polygon.length === 1) {
        return { x: polygon[0].x, y: polygon[0].y };
    }
    const area = getArea(polygon);
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < polygon.length - 1; i++) {
        const start = polygon[i];
        const end = polygon[i + 1];
        const tmp = lineDeterminant(start, end);
        sumX += (end.x + start.x) * tmp;
        sumY += (end.y + start.y) * tmp;
    }
    return { x: sumX / (6 * area), y: sumY / (6 * area) };
}

// point vs polygon: 1 = on boundary, 0 = inside, -1 = outside
function pointPositionFromPolygon(p, polygon) {
    if (polygon.length === 0) {
        return -1;
    }
    for (let i = 0; i < polygon.length; i++) {
        if (polygon[i].x === p.x && polygon[i].y === p.y) {
            return 1;
        }
    }
    let xints = 0;
    let crossings = 0;
    for (let i = 0; i < polygon.length - 1; i++) {
        const start = polygon[i];
        const end = polygon[i + 1];
        if (p.y > Math.min(start.y, end.y) && p.y <= Math.max(start.y, end.y) && p.x <= Math.max(start.x, end.x)) {
            if (start.y !== end.y) {
                xints = ((p.y - start.y) * (end.x - start.x)) / (end.y - start.y) + start.x;
            }
            if (start.x === end.x || p.x <= xints) {
                crossings += 1;
            }
        }
    }
    return crossings % 2 === 1 ? 0 : -1;
}

function polygonContains(polygon, p) {
    return pointPositionFromPolygon(p, polygon) === 0;
}

function pointDistanceToLineSegment(p, start, end) {
    if (start.x === end.x && start.y === end.y) {
        const dx = p.x - start.x;
        const dy = p.y - start.y;
        return Math.hypot(dx, dy);
    }
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const d2 = dx * dx + dy * dy;
    const r = ((p.x - start.x) * dx + (p.y - start.y) * dy) / d2;
    if (r <= 0) {
        return Math.hypot(p.x - start.x, p.y - start.y);
    }
    if (r >= 1) {
        return Math.hypot(p.x - end.x, p.y - end.y);
    }
    return Math.abs((start.y - p.y) * dx - (start.x - p.x) * dy) / Math.sqrt(d2);
}

function shortestDistanceToPath(p, path) {
    const start = path[0];
    if (p.x === start.x && p.y === start.y) {
        return 0;
    }
    let shortestDistance = Infinity;
    for (let i = 0; i < path.length - 1; i++) {
        const segStart = path[i];
        const segEnd = path[i + 1];
        if (p.x === segEnd.x && p.y === segEnd.y) {
            return 0;
        }
        const dist = pointDistanceToLineSegment(p, segStart, segEnd);
        if (dist < shortestDistance) {
            shortestDistance = dist;
        }
    }
    return shortestDistance;
}

// signed distance: positive inside polygon, negative outside
function signedDistance(x, y, polygon) {
    const p = { x, y };
    const inside = polygonContains(polygon, p);
    const distance = shortestDistanceToPath(p, polygon);
    return inside ? distance : -distance;
}

function aabbFromPolygon(polygon) {
    let xmin = Infinity;
    let xmax = -Infinity;
    let ymin = Infinity;
    let ymax = -Infinity;
    for (const p of polygon) {
        if (p.x < xmin) xmin = p.x;
        if (p.x > xmax) xmax = p.x;
        if (p.y < ymin) ymin = p.y;
        if (p.y > ymax) ymax = p.y;
    }
    return { min: { x: xmin, y: ymin }, max: { x: xmax, y: ymax } };
}

function addQuad(mpq, cell, newHeight, polygon) {
    const two = 2;
    const cx = cell.centroid.x;
    const cy = cell.centroid.y;
    const combos = [
        [cx - newHeight, cy - newHeight],
        [cx + newHeight, cy - newHeight],
        [cx - newHeight, cy + newHeight],
        [cx + newHeight, cy + newHeight],
    ];
    for (const combo of combos) {
        const newDist = signedDistance(combo[0], combo[1], polygon);
        mpq.push({
            centroid: { x: combo[0], y: combo[1] },
            extent: newHeight,
            distance: newDist,
            maxDistance: newDist + newHeight * Math.sqrt(two),
        });
    }
}

// pole of inaccessibility (port of polylabel get_core)
function getCore(polygon, tolerance) {
    const two = 2;
    const centroid = getCentroid(polygon);
    const bbox = aabbFromPolygon(polygon);
    const width = bbox.max.x - bbox.min.x;
    const height = bbox.max.y - bbox.min.y;
    const cellSize = Math.min(width, height);

    // degenerate polygons
    if (cellSize === 0) {
        return { x: bbox.min.x, y: bbox.min.y };
    }

    let h = cellSize / two;
    let distance = signedDistance(centroid.x, centroid.y, polygon);
    let bestCell = {
        centroid: { x: centroid.x, y: centroid.y },
        extent: 0,
        distance,
        maxDistance: distance,
    };

    // special case for rectangular polygons
    const bboxCellDist = signedDistance(bbox.min.x + width / two, bbox.min.y + height / two, polygon);
    if (bboxCellDist > bestCell.distance) {
        bestCell = {
            centroid: { x: bbox.min.x + width / two, y: bbox.min.y + height / two },
            extent: 0,
            distance: bboxCellDist,
            maxDistance: bboxCellDist,
        };
    }

    // priority queue, best (largest max_distance) cell first
    const cellQueue = new MaxHeap();

    // build initial quadtree node covering the polygon
    let x = bbox.min.x;
    while (x < bbox.max.x) {
        let y = bbox.min.y;
        while (y < bbox.max.y) {
            const latestDist = signedDistance(x + h, y + h, polygon);
            cellQueue.push({
                centroid: { x: x + h, y: y + h },
                extent: h,
                distance: latestDist,
                maxDistance: latestDist + h * Math.sqrt(two),
            });
            y = y + cellSize;
        }
        x = x + cellSize;
    }

    // try to find better solutions
    while (!cellQueue.isEmpty()) {
        const cell = cellQueue.pop();
        if (cell.distance > bestCell.distance) {
            bestCell = {
                centroid: { x: cell.centroid.x, y: cell.centroid.y },
                extent: cell.extent,
                distance: cell.distance,
                maxDistance: cell.maxDistance,
            };
        }
        // bail out if we can't find a better solution
        if (cell.maxDistance - bestCell.distance <= tolerance) {
            continue;
        }
        // otherwise add a new quadtree node and start again
        h = cell.extent / two;
        addQuad(cellQueue, cell, h, polygon);
    }

    return { x: bestCell.centroid.x, y: bestCell.centroid.y };
}

// ============================================================
// territory border (port of dynmap/src/territory/territory.rs)
// ============================================================

// check if two border points are adjacent (orthogonal, or diagonal with a
// connecting tile) in the padded grid
function pointsAreAdjacentBorder(p1, p2, grid, xmin, ymin) {
    if (p1.x === p2.x && (p1.y === p2.y - 1 || p1.y === p2.y + 1)) {
        return true;
    }
    if (p1.y === p2.y && (p1.x === p2.x - 1 || p1.x === p2.x + 1)) {
        return true;
    }
    const gx1 = 1 - xmin + p1.x;
    const gy1 = 1 - ymin + p1.y;
    if (p1.x === p2.x - 1 && p1.y === p2.y - 1 && (grid[gx1 + 1][gy1] || grid[gx1][gy1 + 1])) {
        return true;
    }
    if (p1.x === p2.x + 1 && p1.y === p2.y - 1 && (grid[gx1 - 1][gy1] || grid[gx1][gy1 + 1])) {
        return true;
    }
    if (p1.x === p2.x - 1 && p1.y === p2.y + 1 && (grid[gx1 + 1][gy1] || grid[gx1][gy1 - 1])) {
        return true;
    }
    if (p1.x === p2.x + 1 && p1.y === p2.y + 1 && (grid[gx1 - 1][gy1] || grid[gx1][gy1 - 1])) {
        return true;
    }
    return false;
}

// iteratively join polylines that share an endpoint into closed loops
function joinEdgeLoops(edgeLoops) {
    const noMoreConnections = [];
    outer: while (edgeLoops.length > 0) {
        let edge1 = edgeLoops.pop();
        const e1First = edge1[0];
        const e1Last = edge1[edge1.length - 1];
        const visitedEdges = [];

        while (edgeLoops.length > 0) {
            const edge2 = edgeLoops.pop();
            const e2First = edge2[0];
            const e2Last = edge2[edge2.length - 1];

            if (e1First.x === e2First.x && e1First.y === e2First.y) {
                edge2.reverse();
                edge2.pop();
                edge2.push(...edge1);
                edge1 = edge2;
                edgeLoops.push(...visitedEdges);
                edgeLoops.push(edge1);
                continue outer;
            }
            if (e1First.x === e2Last.x && e1First.y === e2Last.y) {
                edge2.pop();
                edge2.push(...edge1);
                edge1 = edge2;
                edgeLoops.push(...visitedEdges);
                edgeLoops.push(edge1);
                continue outer;
            }
            if (e1Last.x === e2First.x && e1Last.y === e2First.y) {
                edge1.pop();
                edge1.push(...edge2);
                edgeLoops.push(...visitedEdges);
                edgeLoops.push(edge1);
                continue outer;
            }
            if (e1Last.x === e2Last.x && e1Last.y === e2Last.y) {
                edge2.reverse();
                edge1.pop();
                edge1.push(...edge2);
                edgeLoops.push(...visitedEdges);
                edgeLoops.push(edge1);
                continue outer;
            }
            visitedEdges.push(edge2);
        }

        noMoreConnections.push(edge1);
        edgeLoops = visitedEdges;
    }
    return noMoreConnections;
}

// chunk set -> padded occupancy grid + aabb
function chunkGrid(coordKeys) {
    let xmin = Infinity;
    let xmax = -Infinity;
    let ymin = Infinity;
    let ymax = -Infinity;
    for (const k of coordKeys) {
        const comma = k.indexOf(",");
        const x = parseInt(k.slice(0, comma), 10);
        const y = parseInt(k.slice(comma + 1), 10);
        if (x < xmin) xmin = x;
        if (x > xmax) xmax = x;
        if (y < ymin) ymin = y;
        if (y > ymax) ymax = y;
    }
    const sizeX = 3 + xmax - xmin;
    const sizeY = 3 + ymax - ymin;
    const grid = new Array(sizeX);
    for (let i = 0; i < sizeX; i++) {
        grid[i] = new Array(sizeY).fill(false);
    }
    for (const k of coordKeys) {
        const comma = k.indexOf(",");
        const x = parseInt(k.slice(0, comma), 10);
        const y = parseInt(k.slice(comma + 1), 10);
        grid[1 - xmin + x][1 - ymin + y] = true;
    }
    return { grid, xmin, ymin };
}

/**
 * Compute the territory border buffer. Output format (Int32Array):
 *   [cx, cy,                        core center (grid scaled + grid_offset)
 *    N,                             num border loops (clusters)
 *    n1, e1,                        loop 1: num border points, num edge points
 *    x,y,... x,y,                   loop 1: chunk coords (raw)
 *    ex,ey,... ex,ey,               loop 1: edge points (grid scaled + grid_offset)
 *    n2, e2, ... ]
 */
function territoryGetBorder(terr, gridScale) {
    if (terr.coords.size === 0) {
        return new Int32Array([0, 0, 0]);
    }

    const { grid, xmin, ymin } = chunkGrid(terr.coords);

    // find border points (chunks with at least one empty orthogonal neighbor)
    const borderSet = new Set();
    const border = [];
    for (const k of terr.coords) {
        const comma = k.indexOf(",");
        const x = parseInt(k.slice(0, comma), 10);
        const y = parseInt(k.slice(comma + 1), 10);
        const gx = 1 - xmin + x;
        const gy = 1 - ymin + y;
        if (!grid[gx - 1][gy] || !grid[gx + 1][gy] || !grid[gx][gy - 1] || !grid[gx][gy + 1]) {
            if (!borderSet.has(k)) {
                borderSet.add(k);
                border.push({ x, y });
            }
        }
    }

    // sort by x coord, then cluster border points by connectivity (sweep line)
    border.sort((a, b) => a.x - b.x);
    const clusters = []; // { points: [], xmax, ymin, ymax }

    for (const p of border) {
        let clusterToInsert1 = -1;
        let clusterToInsert2 = -1;

        for (let k = 0; k < clusters.length; k++) {
            const cluster = clusters[k];
            // bbox check
            if (p.x <= cluster.xmax && p.y >= cluster.ymin && p.y <= cluster.ymax) {
                for (let j = cluster.points.length - 1; j >= 0; j--) {
                    const pPrev = cluster.points[j];
                    if (pPrev.x < p.x - 1) {
                        break;
                    }
                    if (pointsAreAdjacentBorder(p, pPrev, grid, xmin, ymin)) {
                        if (clusterToInsert1 === -1) {
                            clusterToInsert1 = k;
                            break;
                        }
                        clusterToInsert2 = k;
                        break;
                    }
                }
            }
        }

        if (clusterToInsert1 !== -1) {
            const idx1 = clusterToInsert1;
            clusters[idx1].points.push(p);
            clusters[idx1].xmax = p.x + 1;
            clusters[idx1].ymin = Math.min(clusters[idx1].ymin, p.y - 1);
            clusters[idx1].ymax = Math.max(clusters[idx1].ymax, p.y + 1);

            if (clusterToInsert2 !== -1) {
                // merge the second cluster into the first (idx1 < idx2 always)
                const idx2 = clusterToInsert2;
                const clusterToMerge = clusters.splice(idx2, 1)[0];
                clusters[idx1].points.push(...clusterToMerge.points);
                clusters[idx1].xmax = Math.max(clusters[idx1].xmax, clusterToMerge.xmax);
                clusters[idx1].ymin = Math.min(clusters[idx1].ymin, clusterToMerge.ymin);
                clusters[idx1].ymax = Math.max(clusters[idx1].ymax, clusterToMerge.ymax);
                clusters[idx1].points.sort((a, b) => a.x - b.x);
            }
        } else {
            clusters.push({
                points: [p],
                xmax: p.x + 1,
                ymin: p.y - 1,
                ymax: p.y + 1,
            });
        }
    }

    // =============================================
    // form edge loops from each cluster: supersample each chunk into
    // four superimposed corners, emit polyline edges per exposed side,
    // then join them into closed loops
    // =============================================
    const gridScale2 = gridScale / 2;
    const gridOffset = gridScale2;
    let largestLoopIndex = 0;
    let largestLoopSize = 0;
    const borderLoops = [];

    for (const c of clusters) {
        let edges = [];
        for (const p of c.points) {
            const gx = 1 - xmin + p.x;
            const gy = 1 - ymin + p.y;

            // bitflags: N=1, S=2, E=4, W=8 (matches rust Edge)
            let nodeType = 0;
            if (!grid[gx][gy - 1]) nodeType |= 1;
            if (!grid[gx][gy + 1]) nodeType |= 2;
            if (!grid[gx - 1][gy]) nodeType |= 8;
            if (!grid[gx + 1][gy]) nodeType |= 4;

            const baseX = gridScale * p.x;
            const baseY = gridScale * p.y;
            const pt = (dx, dy) => ({ x: baseX + dx, y: baseY + dy });

            switch (nodeType) {
                case 1: // N
                    edges.push([pt(-gridScale2, -gridScale2), pt(gridScale2, -gridScale2)]);
                    break;
                case 2: // S
                    edges.push([pt(-gridScale2, gridScale2), pt(gridScale2, gridScale2)]);
                    break;
                case 4: // E
                    edges.push([pt(gridScale2, -gridScale2), pt(gridScale2, gridScale2)]);
                    break;
                case 8: // W
                    edges.push([pt(-gridScale2, -gridScale2), pt(-gridScale2, gridScale2)]);
                    break;
                case 3: // NS
                    edges.push([pt(-gridScale2, -gridScale2), pt(gridScale2, -gridScale2)]);
                    edges.push([pt(-gridScale2, gridScale2), pt(gridScale2, gridScale2)]);
                    break;
                case 12: // EW
                    edges.push([pt(gridScale2, -gridScale2), pt(gridScale2, gridScale2)]);
                    edges.push([pt(-gridScale2, -gridScale2), pt(-gridScale2, gridScale2)]);
                    break;
                case 5: // NE
                    edges.push([pt(-gridScale2, -gridScale2), pt(gridScale2, -gridScale2), pt(gridScale2, gridScale2)]);
                    break;
                case 9: // NW
                    edges.push([pt(-gridScale2, gridScale2), pt(-gridScale2, -gridScale2), pt(gridScale2, -gridScale2)]);
                    break;
                case 6: // SE
                    edges.push([pt(gridScale2, -gridScale2), pt(gridScale2, gridScale2), pt(-gridScale2, gridScale2)]);
                    break;
                case 10: // SW
                    edges.push([pt(gridScale2, gridScale2), pt(-gridScale2, gridScale2), pt(-gridScale2, -gridScale2)]);
                    break;
                case 13: // ENW
                    edges.push([pt(gridScale2, gridScale2), pt(gridScale2, -gridScale2), pt(-gridScale2, -gridScale2), pt(-gridScale2, gridScale2)]);
                    break;
                case 14: // ESW
                    edges.push([pt(gridScale2, -gridScale2), pt(gridScale2, gridScale2), pt(-gridScale2, gridScale2), pt(-gridScale2, -gridScale2)]);
                    break;
                case 7: // NES
                    edges.push([pt(-gridScale2, -gridScale2), pt(gridScale2, -gridScale2), pt(gridScale2, gridScale2), pt(-gridScale2, gridScale2)]);
                    break;
                case 11: // NWS
                    edges.push([pt(gridScale2, -gridScale2), pt(-gridScale2, -gridScale2), pt(-gridScale2, gridScale2), pt(gridScale2, gridScale2)]);
                    break;
                case 15: // NESW (fully enclosed chunk: closed square)
                    edges.push([
                        pt(-gridScale2, -gridScale2), pt(gridScale2, -gridScale2),
                        pt(gridScale2, gridScale2), pt(-gridScale2, gridScale2), pt(-gridScale2, -gridScale2),
                    ]);
                    break;
                default:
                    break;
            }

            // join all possible edge loops
            edges = joinEdgeLoops(edges);
        }

        // rust keeps only the last loop per cluster (see territory.rs)
        const edgeLoop = edges.pop();
        if (edgeLoop !== undefined) {
            borderLoops.push(edgeLoop);
            if (edgeLoop.length > largestLoopSize) {
                largestLoopSize = edgeLoop.length;
                largestLoopIndex = borderLoops.length - 1;
            }
        }
    }

    // centroid ("core") from the largest edge loop; rust uses f32 points
    const largestLoop = borderLoops[largestLoopIndex];
    const largestLoopF = largestLoop.map((p) => ({ x: p.x, y: p.y }));
    const core = getCore(largestLoopF, 1.0);

    // write output buffer
    const out = [];
    out.push(gridOffset + Math.trunc(core.x));
    out.push(gridOffset + Math.trunc(core.y));
    out.push(clusters.length);
    const numLoops = Math.min(clusters.length, borderLoops.length);
    for (let i = 0; i < numLoops; i++) {
        const c = clusters[i];
        const l = borderLoops[i];
        out.push(c.points.length);
        out.push(l.length);
        for (const p of c.points) {
            out.push(p.x, p.y);
        }
        for (const p of l) {
            out.push(gridOffset + p.x, gridOffset + p.y);
        }
    }

    return new Int32Array(out);
}

// coords immediately neighboring this region (keys of empty orthogonal cells)
function territoryGetNeighboringPoints(terr) {
    if (terr.coords.size === 0) {
        return new Set();
    }
    const { grid, xmin, ymin } = chunkGrid(terr.coords);
    const neighborPoints = new Set();
    for (const k of terr.coords) {
        const comma = k.indexOf(",");
        const x = parseInt(k.slice(0, comma), 10);
        const y = parseInt(k.slice(comma + 1), 10);
        const gx = 1 - xmin + x;
        const gy = 1 - ymin + y;
        if (!grid[gx - 1][gy]) neighborPoints.add(key(x - 1, y));
        if (!grid[gx + 1][gy]) neighborPoints.add(key(x + 1, y));
        if (!grid[gx][gy - 1]) neighborPoints.add(key(x, y - 1));
        if (!grid[gx][gy + 1]) neighborPoints.add(key(x, y + 1));
    }
    return neighborPoints;
}

// ============================================================
// graph coloring (port of graph_6_coloring in world.rs)
// ============================================================

// O(n) 6-coloring of the planar territory graph: remove vertices
// smallest-degree-first, then color in reverse removal order with the
// first free color. Returns Map<id, colorIndex(0..5)>.
function graph6Coloring(territories) {
    const graph = new Map(); // id -> { id, neighbors: Set, currentDegree, color }
    const degreeList = new Map(); // degree -> [ids]

    for (const [id, terr] of territories) {
        const degree = terr.neighbors.size;
        graph.set(id, {
            id,
            neighbors: new Set(terr.neighbors),
            currentDegree: degree,
            color: undefined,
        });
        if (!degreeList.has(degree)) {
            degreeList.set(degree, []);
        }
        degreeList.get(degree).push(id);
    }

    const vertListByDegree = [];
    const vertIdToVecIndex = new Map();

    while (degreeList.size > 0) {
        // find smallest degree
        let degree = Infinity;
        for (const d of degreeList.keys()) {
            if (d < degree) degree = d;
        }
        const vertList = degreeList.get(degree);
        const vertId = vertList.pop();
        if (vertList.length === 0) {
            degreeList.delete(degree);
        }
        const vert = graph.get(vertId);
        graph.delete(vertId);

        // update neighbor degrees that are still in graph
        for (const neighborId of vert.neighbors) {
            if (graph.has(neighborId)) {
                const neighborDegree = graph.get(neighborId).currentDegree;
                const neighborList = degreeList.get(neighborDegree);
                const idx = neighborList.indexOf(neighborId);
                neighborList.splice(idx, 1);
                if (neighborList.length === 0) {
                    degreeList.delete(neighborDegree);
                }
                const newDegree = neighborDegree - 1;
                graph.get(neighborId).currentDegree = newDegree;
                if (!degreeList.has(newDegree)) {
                    degreeList.set(newDegree, []);
                }
                degreeList.get(newDegree).push(neighborId);
            }
        }

        vertIdToVecIndex.set(vert.id, vertListByDegree.length);
        vertListByDegree.push(vert);
    }

    // color vertices in reverse removal order
    const colors = new Map();
    for (let i = vertListByDegree.length - 1; i >= 0; i--) {
        const vert = vertListByDegree[i];
        const neighborColors = [false, false, false, false, false, false];
        for (const neighborId of vert.neighbors) {
            const neighborIndex = vertIdToVecIndex.get(neighborId);
            const c = vertListByDegree[neighborIndex].color;
            if (c !== undefined) {
                neighborColors[c] = true;
            }
        }
        for (let c = 0; c < 6; c++) {
            if (!neighborColors[c]) {
                vert.color = c;
                colors.set(vert.id, c);
                break;
            }
        }
    }

    return colors;
}

// ============================================================
// random subdivision (port of territory/generator.rs)
// ============================================================

// safety cap on the number of generated cells (browser perf guard;
// rust has no cap)
const MAX_CELLS = 512;

/**
 * Generate cell centroids for subdividing a territory.
 *
 * Discrete Lloyd relaxation over the territory chunks: start with
 * `~area/(pi*r^2)` random points in the expanded aabb, then iterate
 * (assign chunks to nearest centroid, move centroid to mean of its
 * chunks) `iterations` times. Optionally stretch the centroids around
 * the diagram midpoint by (scaleX, scaleY) before returning.
 *
 * This is a simplification of the rust voronator polygon diagram +
 * Lloyd/corner smoothing; the visible result (a smooth random
 * partition) is equivalent for the editor's purposes.
 */
function generateRandomCellCentroids(coordKeys, min, max, averageRadius, seed, iterations, scaleX, scaleY) {
    const rng = rngFromSeed(seed);

    const cellAvgArea = Math.PI * averageRadius * averageRadius;
    const area = (max.x - min.x) * (max.y - min.y);
    let npoints = Math.max(3, Math.round(area / cellAvgArea));
    if (!Number.isFinite(npoints)) {
        npoints = MAX_CELLS;
    }
    npoints = Math.min(npoints, MAX_CELLS);

    let centroids = [];
    for (let i = 0; i < npoints; i++) {
        centroids.push({
            x: min.x + rng() * (max.x - min.x),
            y: min.y + rng() * (max.y - min.y),
        });
    }

    // parse chunks once
    const chunks = [];
    for (const k of coordKeys) {
        const comma = k.indexOf(",");
        chunks.push({
            x: parseInt(k.slice(0, comma), 10),
            y: parseInt(k.slice(comma + 1), 10),
        });
    }
    if (chunks.length === 0) {
        return centroids;
    }

    // discrete Lloyd relaxation
    for (let iter = 0; iter < iterations; iter++) {
        const sums = centroids.map(() => ({ x: 0, y: 0, n: 0 }));
        for (const c of chunks) {
            let best = 0;
            let bestD = Infinity;
            for (let i = 0; i < centroids.length; i++) {
                const dx = c.x - centroids[i].x;
                const dy = c.y - centroids[i].y;
                const d = dx * dx + dy * dy;
                if (d < bestD) {
                    bestD = d;
                    best = i;
                }
            }
            sums[best].x += c.x;
            sums[best].y += c.y;
            sums[best].n += 1;
        }
        for (let i = 0; i < centroids.length; i++) {
            if (sums[i].n > 0) {
                centroids[i] = { x: sums[i].x / sums[i].n, y: sums[i].y / sums[i].n };
            }
        }
    }

    // stretch cells around the diagram midpoint (mirrors rust CellDiagram::scale)
    if (scaleX !== 1.0 || scaleY !== 1.0) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const c of centroids) {
            if (c.x < minX) minX = c.x;
            if (c.x > maxX) maxX = c.x;
            if (c.y < minY) minY = c.y;
            if (c.y > maxY) maxY = c.y;
        }
        const originX = (maxX + minX) / 2;
        const originY = (maxY + minY) / 2;
        centroids = centroids.map((c) => ({
            x: (c.x - originX) * scaleX + originX,
            y: (c.y - originY) * scaleY + originY,
        }));
    }

    return centroids;
}

// ============================================================
// World
// ============================================================

export class World {
    constructor(gridScale) {
        this.grid = new Map(); // "x,y" -> territory id
        this.gridOccupied = new Set(); // "x,y"
        this.gridScale = gridScale;
        this.territories = new Map(); // id -> { id, coords:Set("x,y"), neighbors:Set(id), color, isAtEdge }
        this.territoryIdCounter = 0;
    }

    clear() {
        this.grid.clear();
        this.gridOccupied.clear();
        this.territories.clear();
    }

    getTerritoryIdCounter() {
        return this.territoryIdCounter;
    }

    setTerritoryIdCounter(count) {
        this.territoryIdCounter = count;
    }

    getNewTerritoryId() {
        return this.territoryIdCounter++;
    }

    createTerritory(id) {
        if (id === undefined || id === null) {
            id = this.territoryIdCounter++;
        }
        this.territories.set(id, {
            id,
            coords: new Set(),
            neighbors: new Set(),
            color: undefined,
            isAtEdge: false,
        });
        return id;
    }

    deleteTerritory(id) {
        const territory = this.territories.get(id);
        if (territory === undefined) {
            return;
        }
        for (const k of territory.coords) {
            this.gridOccupied.delete(k);
            this.grid.delete(k);
        }
        this.territories.delete(id);
    }

    getTerritorySize(id) {
        const territory = this.territories.get(id);
        return territory === undefined ? undefined : territory.coords.size;
    }

    getTerritoryChunksBuffer(id) {
        const territory = this.territories.get(id);
        if (territory === undefined) {
            return [];
        }
        const buffer = [];
        for (const k of territory.coords) {
            const comma = k.indexOf(",");
            buffer.push(parseInt(k.slice(0, comma), 10), parseInt(k.slice(comma + 1), 10));
        }
        return buffer;
    }

    getTerritoryBorder(id) {
        const territory = this.territories.get(id);
        if (territory === undefined) {
            return new Int32Array();
        }
        return territoryGetBorder(territory, this.gridScale);
    }

    listTerritories() {
        // rust prints territory coords to console (disabled); no-op
    }

    addCoordsToTerritory(id, coords) {
        const territory = this.territories.get(id);
        if (territory === undefined) {
            return false;
        }
        const newCoords = new Set();
        for (let i = 0; i + 1 < coords.length; i += 2) {
            const k = key(coords[i], coords[i + 1]);
            // only add coords not already occupied in the world grid
            if (!this.gridOccupied.has(k)) {
                newCoords.add(k);
                this.gridOccupied.add(k);
                this.grid.set(k, id);
            }
        }
        for (const k of newCoords) {
            territory.coords.add(k);
        }
        return true;
    }

    removeCoords(coords) {
        for (let i = 0; i + 1 < coords.length; i += 2) {
            const k = key(coords[i], coords[i + 1]);
            if (this.gridOccupied.has(k)) {
                this.gridOccupied.delete(k);
                const terrId = this.grid.get(k);
                this.grid.delete(k);
                if (terrId !== undefined) {
                    const territory = this.territories.get(terrId);
                    if (territory !== undefined) {
                        territory.coords.delete(k);
                    }
                }
            }
        }
    }

    addCircleToTerritory(id, cx, cy, radius) {
        if (radius <= 0) {
            return false;
        }
        const territory = this.territories.get(id);
        if (territory === undefined) {
            return false;
        }
        const unoccupied = [];
        for (let gx = -radius; gx <= radius; gx++) {
            for (let gy = -radius; gy <= radius; gy++) {
                if (Math.hypot(gx, gy) < radius) {
                    const k = key(cx + gx, cy + gy);
                    if (!this.gridOccupied.has(k)) {
                        unoccupied.push(k);
                    }
                }
            }
        }
        if (unoccupied.length > 0) {
            for (const k of unoccupied) {
                this.grid.set(k, id);
                this.gridOccupied.add(k);
                territory.coords.add(k);
            }
            return true;
        }
        return false;
    }

    removeCircleToTerritory(id, cx, cy, radius) {
        if (radius <= 0) {
            return false;
        }
        const territory = this.territories.get(id);
        if (territory === undefined) {
            return false;
        }
        const circleChunks = [];
        for (let gx = -radius; gx <= radius; gx++) {
            for (let gy = -radius; gy <= radius; gy++) {
                if (Math.hypot(gx, gy) < radius) {
                    const k = key(cx + gx, cy + gy);
                    if (this.grid.get(k) === id) {
                        circleChunks.push(k);
                    }
                }
            }
        }
        if (circleChunks.length > 0) {
            for (const k of circleChunks) {
                this.grid.delete(k);
                this.gridOccupied.delete(k);
                territory.coords.delete(k);
            }
            return true;
        }
        return false;
    }

    calculateNeighbors() {
        for (const [id, terr] of this.territories) {
            const neighborPoints = territoryGetNeighboringPoints(terr);
            let isAtEdge = false;
            const neighborTerritories = new Set();
            for (const k of neighborPoints) {
                const tid = this.grid.get(k);
                if (tid !== undefined) {
                    neighborTerritories.add(tid);
                }
                if (!this.gridOccupied.has(k)) {
                    isAtEdge = true;
                }
            }
            terr.neighbors = neighborTerritories;
            terr.isAtEdge = isAtEdge;
        }
    }

    getTerritoryNeighbors(id) {
        const territory = this.territories.get(id);
        if (territory === undefined) {
            return [];
        }
        return Array.from(territory.neighbors);
    }

    generateColors() {
        for (const terr of this.territories.values()) {
            terr.color = undefined;
        }
        const colors = graph6Coloring(this.territories);
        for (const [id, color] of colors) {
            const terr = this.territories.get(id);
            if (terr !== undefined) {
                terr.color = color;
            }
        }
    }

    getTerritoryColor(id) {
        const territory = this.territories.get(id);
        return territory === undefined ? undefined : territory.color;
    }

    getTerritoryIsEdge(id) {
        const territory = this.territories.get(id);
        return territory === undefined ? undefined : territory.isAtEdge;
    }

    getTerritoriesInAABB(xmin, ymin, xmax, ymax) {
        const terrIds = [];
        for (const [id, terr] of this.territories) {
            for (const k of terr.coords) {
                const comma = k.indexOf(",");
                const x = parseInt(k.slice(0, comma), 10);
                const y = parseInt(k.slice(comma + 1), 10);
                if (x < xmin || x > xmax || y < ymin || y > ymax) {
                    continue;
                }
                terrIds.push(id);
                break;
            }
        }
        return terrIds;
    }

    mergeTerritories(ids) {
        if (ids.length === 0) {
            return undefined;
        }
        if (ids.length === 1) {
            return this.territories.has(ids[0]) ? ids[0] : undefined;
        }
        for (const id of ids) {
            if (!this.territories.has(id)) {
                return undefined;
            }
        }
        const mergedId = ids[0];
        const mergedTerr = this.territories.get(mergedId);
        this.territories.delete(mergedId);
        for (let i = 1; i < ids.length; i++) {
            const terr = this.territories.get(ids[i]);
            this.territories.delete(ids[i]);
            for (const k of terr.coords) {
                mergedTerr.coords.add(k);
                this.grid.set(k, mergedId);
            }
        }
        this.territories.set(mergedId, mergedTerr);
        return mergedId;
    }

    // internal: insert coords into a territory AND the world grid
    // (no occupancy check; mirrors rust add_points_to_territory)
    addPointsToTerritory(id, coordSet) {
        const territory = this.territories.get(id);
        if (territory === undefined) {
            return false;
        }
        for (const k of coordSet) {
            this.gridOccupied.add(k);
            this.grid.set(k, id);
            territory.coords.add(k);
        }
        return true;
    }

    // internal: re-insert a territory object into the world grid
    // (mirrors rust add_territory)
    addTerritory(terr) {
        for (const k of terr.coords) {
            this.gridOccupied.add(k);
            this.grid.set(k, terr.id);
        }
        this.territories.set(terr.id, terr);
    }

    subdivideIntoRandomTerritories(
        id,
        averageRadius,
        scaleX,
        scaleY,
        randomSeed,
        iterationsSmoothCenter,
        iterationsSmoothCorner,
        deleteSmallerThan,
        mergeSmallerThan,
    ) {
        const territory = this.territories.get(id);
        if (territory === undefined) {
            return undefined;
        }

        // remove territory and its chunks from the world grid
        this.territories.delete(id);
        for (const k of territory.coords) {
            this.gridOccupied.delete(k);
            this.grid.delete(k);
        }

        // get min/max from territory bounding box, slightly expand it
        let xmin = Infinity;
        let xmax = -Infinity;
        let ymin = Infinity;
        let ymax = -Infinity;
        for (const k of territory.coords) {
            const comma = k.indexOf(",");
            const x = parseInt(k.slice(0, comma), 10);
            const y = parseInt(k.slice(comma + 1), 10);
            if (x < xmin) xmin = x;
            if (x > xmax) xmax = x;
            if (y < ymin) ymin = y;
            if (y > ymax) ymax = y;
        }
        const min = { x: xmin - 1, y: ymin - 1 };
        const max = { x: xmax + 1, y: ymax + 1 };

        const iterations = Math.max(0, iterationsSmoothCenter) + Math.max(0, iterationsSmoothCorner);
        const cellCentroids = generateRandomCellCentroids(
            territory.coords,
            min,
            max,
            Math.max(0, averageRadius),
            randomSeed,
            iterations,
            Math.max(0, scaleX),
            Math.max(0, scaleY),
        );

        // assign each chunk to its nearest cell
        const cells = new Map(); // cell index -> Set of coord keys
        for (const k of territory.coords) {
            const comma = k.indexOf(",");
            const x = parseInt(k.slice(0, comma), 10);
            const y = parseInt(k.slice(comma + 1), 10);
            let best = 0;
            let bestD = Infinity;
            for (let i = 0; i < cellCentroids.length; i++) {
                const dx = x - cellCentroids[i].x;
                const dy = y - cellCentroids[i].y;
                const d = dx * dx + dy * dy;
                if (d < bestD) {
                    bestD = d;
                    best = i;
                }
            }
            let cellSet = cells.get(best);
            if (cellSet === undefined) {
                cellSet = new Set();
                cells.set(best, cellSet);
            }
            cellSet.add(k);
        }

        // create new territories, skipping any smaller than deleteSmallerThan
        const newTerritoryIds = [];
        for (const cellSet of cells.values()) {
            if (deleteSmallerThan > 0 && cellSet.size < deleteSmallerThan) {
                continue;
            }
            const newId = this.createTerritory(undefined);
            this.addPointsToTerritory(newId, cellSet);
            newTerritoryIds.push(newId);
        }

        // merge territories smaller than mergeSmallerThan into their
        // smallest neighbor that is larger (mirrors rust)
        if (mergeSmallerThan > 0) {
            this.calculateNeighbors();
            const mergeSize = mergeSmallerThan;

            const tooSmallIds = [];
            for (const [tid, t] of this.territories) {
                if (t.coords.size <= mergeSize) {
                    tooSmallIds.push(tid);
                }
            }

            const tooSmallTerritories = [];
            for (const tid of tooSmallIds) {
                const t = this.territories.get(tid);
                this.territories.delete(tid);
                for (const k of t.coords) {
                    this.gridOccupied.delete(k);
                    this.grid.delete(k);
                }
                tooSmallTerritories.push(t);
            }

            const remainingTerritories = [];
            for (const t of tooSmallTerritories) {
                // find smallest neighbor larger than mergeSize
                let neighborToJoin = undefined;
                let neighborToJoinSize = Infinity;
                for (const nid of t.neighbors) {
                    const neighbor = this.territories.get(nid);
                    if (neighbor !== undefined) {
                        const neighborSize = neighbor.coords.size;
                        if (neighborSize < neighborToJoinSize && neighborSize > mergeSize) {
                            neighborToJoin = nid;
                            neighborToJoinSize = neighborSize;
                        }
                    }
                }
                if (neighborToJoin !== undefined) {
                    this.addPointsToTerritory(neighborToJoin, t.coords);
                } else {
                    remainingTerritories.push(t);
                }
            }

            // territories with no merge candidate: re-add to the world
            for (const t of remainingTerritories) {
                this.addTerritory(t);
            }

            // drop new territory ids that were merged away
            for (let i = newTerritoryIds.length - 1; i >= 0; i--) {
                if (!this.territories.has(newTerritoryIds[i])) {
                    newTerritoryIds.splice(i, 1);
                }
            }
        }

        return newTerritoryIds;
    }
}

// ============================================================
// IndexSampler
// ============================================================

/**
 * Discrete probability sampler over a list of weights using Vose's
 * alias method (port of sampler.rs).
 */
export class IndexSampler {
    constructor(randomSeed, weights) {
        const n = weights.length;
        if (n === 0) {
            throw new Error("IndexSampler: empty weights");
        }
        for (const w of weights) {
            if (w < 0) {
                throw new Error("IndexSampler: negative weight");
            }
        }
        let total = 0;
        for (const w of weights) {
            total += w;
        }
        if (!(total > 0)) {
            throw new Error("IndexSampler: total weight must be > 0");
        }

        const prob = weights.map((w) => (w / total) * n);
        const alias = new Array(n).fill(-1);
        const small = [];
        const large = [];
        for (let i = 0; i < n; i++) {
            if (prob[i] < 1) {
                small.push(i);
            } else {
                large.push(i);
            }
        }
        while (small.length > 0 && large.length > 0) {
            const l = small.pop();
            const g = large.pop();
            alias[l] = g;
            prob[g] = prob[g] - (1 - prob[l]);
            if (prob[g] < 1) {
                small.push(g);
            } else {
                large.push(g);
            }
        }
        // floating point leftovers: remaining small entries alias to themselves
        while (small.length > 0) {
            const l = small.pop();
            alias[l] = l;
        }

        this._prob = prob;
        this._alias = alias;
        this._rng = rngFromSeed(randomSeed);
    }

    static fromWeights(randomSeed, weights) {
        return new IndexSampler(randomSeed, weights);
    }

    sample() {
        const n = this._prob.length;
        const i = Math.floor(this._rng() * n);
        if (this._rng() < this._prob[i]) {
            return i;
        }
        const a = this._alias[i];
        return a === -1 ? i : a;
    }
}

// ============================================================
// misc (test function, matches wasm greet)
// ============================================================

export function greet() {
    console.log("hello world!");
}
