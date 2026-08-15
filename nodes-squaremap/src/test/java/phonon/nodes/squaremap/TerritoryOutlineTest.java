package phonon.nodes.squaremap;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

class TerritoryOutlineTest {

    private static int[][] cells(int... coords) {
        int[][] out = new int[coords.length / 2][2];
        for (int i = 0; i + 1 < coords.length; i += 2) {
            out[i / 2][0] = coords[i];
            out[i / 2][1] = coords[i + 1];
        }
        return out;
    }

    private static List<TerritoryOutline.Ring> compute(int... coords) {
        return TerritoryOutline.compute(cells(coords));
    }

    @Test
    void emptyChunks() {
        assertTrue(TerritoryOutline.compute(cells()).isEmpty());
    }

    @Test
    void singleChunk() {
        List<TerritoryOutline.Ring> rings = compute(0, 0);
        assertEquals(1, rings.size());
        TerritoryOutline.Ring ring = rings.get(0);
        assertEquals(5, ring.points.size()); // closed loop, 4 corners + repeat
        assertEquals(256.0, ring.area(), 1e-6);
        assertEquals(0, ring.depth);
    }

    @Test
    void twoByTwoSquare() {
        List<TerritoryOutline.Ring> rings = compute(0, 0, 1, 0, 0, 1, 1, 1);
        assertEquals(1, rings.size());
        assertEquals(9, rings.get(0).points.size()); // 8 corners + repeat
        assertEquals(1024.0, rings.get(0).area(), 1e-6);
    }

    @Test
    void sharedEdgeMergesIntoOneRing() {
        List<TerritoryOutline.Ring> rings = compute(0, 0, 1, 0);
        assertEquals(1, rings.size());
        assertEquals(7, rings.get(0).points.size()); // 6 corners + repeat
        assertEquals(512.0, rings.get(0).area(), 1e-6);
    }

    @Test
    void diagonalTouchYieldsTwoRings() {
        List<TerritoryOutline.Ring> rings = compute(0, 0, 1, 1);
        assertEquals(2, rings.size());
        for (TerritoryOutline.Ring ring : rings) {
            assertEquals(5, ring.points.size());
            assertEquals(0, ring.depth);
        }
    }

    @Test
    void ringWithHole() {
        // 3x3 square missing the center cell -> outer ring + hole ring
        List<TerritoryOutline.Ring> rings = compute(
            0, 0, 1, 0, 2, 0,
            0, 1, 2, 1,
            0, 2, 1, 2, 2, 2);
        assertEquals(2, rings.size());

        TerritoryOutline.Ring outer = rings.get(0);
        TerritoryOutline.Ring inner = rings.get(1);
        assertEquals(0, outer.depth);
        assertEquals(1, inner.depth);
        assertEquals(0, inner.parentIndex);
        assertEquals(13, outer.points.size()); // 12 corners + repeat
        assertEquals(5, inner.points.size());   // 4 corners + repeat
        assertTrue(outer.area() > inner.area());
        // outer ring encloses the full 3x3 (shoelace includes the hole),
        // the hole ring is the missing center cell.
        assertEquals(3 * 3 * 256.0, outer.area(), 1e-6);
        assertEquals(256.0, inner.area(), 1e-6);
    }

    @Test
    void disconnectedTerritories() {
        List<TerritoryOutline.Ring> rings = compute(0, 0, 5, 5);
        assertEquals(2, rings.size());
        for (TerritoryOutline.Ring ring : rings) {
            assertEquals(0, ring.depth);
        }
    }

    @Test
    void negativeCoordinates() {
        // L-shape in negative chunk coords: (-1,-1), (0,-1), (-1,0)
        List<TerritoryOutline.Ring> rings = compute(-1, -1, 0, -1, -1, 0);
        assertEquals(1, rings.size());
        TerritoryOutline.Ring ring = rings.get(0);
        assertEquals(9, ring.points.size()); // 8 corners + repeat
        assertEquals(3 * 256.0, ring.area(), 1e-6);
        for (long[] p : ring.points) {
            assertTrue(p[0] % 16 == 0 || p[0] == 0, "corner x must align to chunk grid");
        }
    }

    @Test
    void concaveLShape() {
        // cells (0,0),(1,0),(2,0),(0,1) -> an L shape
        List<TerritoryOutline.Ring> rings = compute(0, 0, 1, 0, 2, 0, 0, 1);
        assertEquals(1, rings.size());
        TerritoryOutline.Ring ring = rings.get(0);
        assertEquals(11, ring.points.size()); // 10 corners + repeat
        assertEquals(4 * 256.0, ring.area(), 1e-6);
    }
}
