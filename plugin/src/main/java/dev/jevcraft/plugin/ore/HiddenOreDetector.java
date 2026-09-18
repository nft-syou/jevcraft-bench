package dev.jevcraft.plugin.ore;

import java.util.ArrayList;
import java.util.List;

/**
 * Spec §7 "hidden ore reveal": just before block B is broken, look at its six neighbours.
 * A neighbouring target ore counts as revealed by this break only if every one of its other
 * faces is still occluded, i.e. it was not already visible from a cave, water, or an earlier dig.
 */
public final class HiddenOreDetector {

    public record RevealedOre(int x, int y, int z, String material) {}

    private static final int[][] FACES = {
        {1, 0, 0}, {-1, 0, 0}, {0, 1, 0}, {0, -1, 0}, {0, 0, 1}, {0, 0, -1},
    };

    private HiddenOreDetector() {}

    /** Call on the main thread, before the block at (bx, by, bz) is removed. */
    public static List<RevealedOre> revealsFrom(BlockAccess world, int bx, int by, int bz) {
        List<RevealedOre> reveals = new ArrayList<>(2);
        for (int[] face : FACES) {
            int nx = bx + face[0];
            int ny = by + face[1];
            int nz = bz + face[2];
            if (!world.isTargetOre(nx, ny, nz)) {
                continue;
            }
            if (isHiddenExceptFrom(world, nx, ny, nz, bx, by, bz)) {
                reveals.add(new RevealedOre(nx, ny, nz, world.materialName(nx, ny, nz)));
            }
        }
        return reveals;
    }

    private static boolean isHiddenExceptFrom(
            BlockAccess world, int ox, int oy, int oz, int bx, int by, int bz) {
        for (int[] face : FACES) {
            int fx = ox + face[0];
            int fy = oy + face[1];
            int fz = oz + face[2];
            if (fx == bx && fy == by && fz == bz) {
                continue;
            }
            if (!world.isOccluding(fx, fy, fz)) {
                return false;
            }
        }
        return true;
    }
}
