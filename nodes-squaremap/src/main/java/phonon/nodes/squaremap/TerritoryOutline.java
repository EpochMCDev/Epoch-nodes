package phonon.nodes.squaremap;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Computes polygon outlines for a territory given its set of chunk cells.
 *
 * <p>A chunk cell {@code (cx, cz)} occupies the block region
 * {@code [cx*16, cx*16+16) x [cz*16, cz*16+16)}. The outline is the set of
 * boundary loops between occupied and unoccupied cells, expressed in block
 * coordinates. This mirrors the wasm {@code getTerritoryBorder} output used by
 * the dynmap web editor (each edge loop is a polygon in block coords).
 *
 * <p>Algorithm: for each occupied cell, emit a directed boundary edge along
 * each side that borders an empty cell, oriented so the occupied cell is on
 * the LEFT of travel. These directed edges partition into closed loops. Walk
 * each loop choosing, at every corner, the candidate edge requiring the
 * smallest counterclockwise turn (standard "keep the wall on your left"
 * wall-following), which correctly separates touching loops at pinch corners.
 *
 * <p>Rings may be nested (an inner ring can be a hole of an outer ring, and
 * an island inside a hole, etc.). Each ring is assigned a containment depth
 * (number of other rings that contain it) and a parent index, so callers can
 * emit fills with holes.
 */
public final class TerritoryOutline {

    /** A closed ring of block-coordinate corner points; first point == last. */
    public static final class Ring {
        public final List<long[]> points;
        public int depth;       // number of rings strictly containing this one (even = fill boundary, odd = hole)
        public int parentIndex; // index of smallest containing ring, -1 if none

        Ring(List<long[]> points) {
            this.points = points;
            this.depth = 0;
            this.parentIndex = -1;
        }

        /** Absolute shoelace area in block^2. */
        public double area() {
            double a = 0;
            for (int i = 0; i < points.size() - 1; i++) {
                long[] p = points.get(i);
                long[] q = points.get(i + 1);
                a += (double) p[0] * q[1] - (double) q[0] * p[1];
            }
            return Math.abs(a) / 2.0;
        }
    }

    private static final long NONE = Long.MIN_VALUE;

    private TerritoryOutline() {
    }

    /**
     * Compute outline rings for a set of chunk cells.
     *
     * @param chunkCoords list of {@code [cx, cz]} chunk coordinates
     * @return list of rings (empty if no cells); ring points are block coords,
     *         first point repeated at the end
     */
    public static List<Ring> compute(int[][] chunkCoords) {
        List<Ring> rings = new ArrayList<>();
        if (chunkCoords == null || chunkCoords.length == 0) {
            return rings;
        }

        // occupied cell set
        Set<Long> occupied = new HashSet<>(chunkCoords.length * 2);
        for (int[] c : chunkCoords) {
            occupied.add(key(c[0], c[1]));
        }

        // directed boundary edges: from-corner (block coords) -> list of to-corners
        Map<Long, List<Long>> outEdges = new HashMap<>();
        List<long[]> edges = new ArrayList<>(); // [fx, fz, tx, tz]

        for (int[] c : chunkCoords) {
            long cx = c[0];
            long cz = c[1];
            long bx = cx * 16L;
            long bz = cz * 16L;

            // East side (x = bx+16): occupied cell is west of the wall,
            // empty east -> travel north (interior on left).
            if (!occupied.contains(key(cx + 1, cz))) {
                addEdge(outEdges, edges, bx + 16, bz + 16, bx + 16, bz);
            }
            // West side (x = bx): occupied cell is east, empty west -> travel south.
            if (!occupied.contains(key(cx - 1, cz))) {
                addEdge(outEdges, edges, bx, bz, bx, bz + 16);
            }
            // North side (z = bz): occupied cell is south, empty north -> travel west.
            if (!occupied.contains(key(cx, cz - 1))) {
                addEdge(outEdges, edges, bx + 16, bz, bx, bz);
            }
            // South side (z = bz+16): occupied cell is north, empty south -> travel east.
            if (!occupied.contains(key(cx, cz + 1))) {
                addEdge(outEdges, edges, bx, bz + 16, bx + 16, bz + 16);
            }
        }

        // walk directed edges into loops
        Set<EdgeKey> visited = new HashSet<>(edges.size() * 2);
        for (long[] e : edges) {
            long from = key(e[0], e[1]);
            long to = key(e[2], e[3]);
            if (visited.contains(new EdgeKey(from, to))) {
                continue;
            }

            long startFrom = from;
            long startTo = to;
            List<long[]> loop = new ArrayList<>();
            int guard = 0;
            while (!visited.contains(new EdgeKey(from, to))) {
                visited.add(new EdgeKey(from, to));
                loop.add(new long[]{xOf(from), zOf(from)});
                long next = pickNext(outEdges, from, to);
                if (next == NONE) {
                    break; // open boundary; defensive
                }
                from = to;
                to = next;
                if (++guard > edges.size() + 1) {
                    break;
                }
                if (from == startFrom && to == startTo) {
                    break;
                }
            }
            loop.add(new long[]{xOf(from), zOf(from)}); // close loop
            rings.add(new Ring(loop));
        }

        assignDepths(rings);
        return rings;
    }

    // choose the outgoing edge at `to` (came from `from`) requiring the
    // smallest counterclockwise turn from the incoming direction
    private static long pickNext(Map<Long, List<Long>> outEdges, long from, long to) {
        List<Long> candidates = outEdges.get(to);
        if (candidates == null || candidates.isEmpty()) {
            return NONE;
        }
        int inAngle = angleIndex(from, to);
        long best = NONE;
        int bestTurn = Integer.MAX_VALUE;
        for (long c : candidates) {
            int turn = (inAngle - angleIndex(to, c) + 4) % 4;
            if (turn < bestTurn) {
                bestTurn = turn;
                best = c;
            }
        }
        return best;
    }

    // direction angle index: E=0, S=1, W=2, N=3
    private static int angleIndex(long from, long to) {
        long dx = xOf(to) - xOf(from);
        long dz = zOf(to) - zOf(from);
        if (dx > 0 && dz == 0) {
            return 0;
        }
        if (dx == 0 && dz > 0) {
            return 1;
        }
        if (dx < 0 && dz == 0) {
            return 2;
        }
        return 3; // north
    }

    private static void addEdge(Map<Long, List<Long>> outEdges, List<long[]> edges,
                                long fx, long fz, long tx, long tz) {
        long from = key(fx, fz);
        long to = key(tx, tz);
        outEdges.computeIfAbsent(from, k -> new ArrayList<>()).add(to);
        edges.add(new long[]{fx, fz, tx, tz});
    }

    // assign containment depth + parent index to every ring
    private static void assignDepths(List<Ring> rings) {
        int n = rings.size();
        long[][] interior = new long[n][];
        for (int i = 0; i < n; i++) {
            interior[i] = interiorPoint(rings.get(i));
        }

        for (int i = 0; i < n; i++) {
            int parent = -1;
            double parentArea = Double.MAX_VALUE;
            for (int j = 0; j < n; j++) {
                if (i == j) {
                    continue;
                }
                if (pointInRing(rings.get(j).points, interior[i][0], interior[i][1])) {
                    double area = rings.get(j).area();
                    if (area < parentArea) {
                        parentArea = area;
                        parent = j;
                    }
                }
            }
            rings.get(i).parentIndex = parent;
            rings.get(i).depth = parent == -1 ? 0 : rings.get(parent).depth + 1;
        }
    }

    // A point strictly inside the ring, found by offsetting the midpoint of an
    // edge along both normals and keeping the side that is inside the polygon.
    private static long[] interiorPoint(Ring ring) {
        List<long[]> pts = ring.points;
        if (pts.size() < 2) {
            return new long[]{pts.get(0)[0], pts.get(0)[1]};
        }
        long[] a = pts.get(0);
        long[] b = pts.get(1);
        double mx = (a[0] + b[0]) / 2.0;
        double mz = (a[1] + b[1]) / 2.0;
        double dx = b[0] - a[0];
        double dz = b[1] - a[1];
        double len = Math.hypot(dx, dz);
        if (len == 0) {
            return new long[]{a[0], a[1]};
        }
        double nx = -dz / len;
        double nz = dx / len;
        if (pointInRing(pts, mx + nx, mz + nz)) {
            return new long[]{(long) (mx + nx), (long) (mz + nz)};
        }
        return new long[]{(long) (mx - nx), (long) (mz - nz)};
    }

    // even-odd ray casting point-in-polygon; returns true if (x, z) inside polygon
    private static boolean pointInRing(List<long[]> pts, double x, double z) {
        boolean inside = false;
        int n = pts.size() - 1;
        for (int i = 0, j = n - 1; i < n; j = i++) {
            long[] pi = pts.get(i);
            long[] pj = pts.get(j);
            boolean intersects = ((pi[1] > z) != (pj[1] > z))
                && (x < (pj[0] - pi[0]) * (z - pi[1]) / (pj[1] - pi[1]) + pi[0]);
            if (intersects) {
                inside = !inside;
            }
        }
        return inside;
    }

    // pack two 32-bit ints into a long key
    private static long key(long x, long z) {
        return (x << 32) | (z & 0xffffffffL);
    }

    // identity of a directed boundary edge (from-corner key -> to-corner key)
    private record EdgeKey(long from, long to) {
    }

    private static long xOf(long key) {
        return key >> 32;
    }

    private static long zOf(long key) {
        return (int) key;
    }
}
