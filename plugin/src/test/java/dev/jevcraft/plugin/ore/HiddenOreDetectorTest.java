package dev.jevcraft.plugin.ore;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.jevcraft.plugin.ore.HiddenOreDetector.RevealedOre;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class HiddenOreDetectorTest {

    /** Solid stone everywhere unless overridden. */
    private static final class World implements BlockAccess {
        private final Map<String, String> blocks = new HashMap<>();
        private static final Set<String> ORES = Set.of("DIAMOND_ORE", "DEEPSLATE_DIAMOND_ORE", "ANCIENT_DEBRIS");
        private static final Set<String> TRANSPARENT = Set.of("AIR", "WATER", "GLASS", "CAVE_AIR");

        World set(int x, int y, int z, String material) {
            blocks.put(x + "," + y + "," + z, material);
            return this;
        }

        @Override
        public String materialName(int x, int y, int z) {
            return blocks.getOrDefault(x + "," + y + "," + z, "STONE");
        }

        @Override
        public boolean isTargetOre(int x, int y, int z) {
            return ORES.contains(materialName(x, y, z));
        }

        @Override
        public boolean isOccluding(int x, int y, int z) {
            return !TRANSPARENT.contains(materialName(x, y, z));
        }
    }

    @Test
    void fullyBuriedOreNextToTheBrokenBlockIsRevealed() {
        World w = new World().set(1, 0, 0, "DIAMOND_ORE");
        assertEquals(List.of(new RevealedOre(1, 0, 0, "DIAMOND_ORE")), HiddenOreDetector.revealsFrom(w, 0, 0, 0));
    }

    @Test
    void oreOnEveryFaceOfTheBrokenBlockIsReported() {
        World w = new World()
                .set(1, 0, 0, "DIAMOND_ORE")
                .set(-1, 0, 0, "DEEPSLATE_DIAMOND_ORE")
                .set(0, 1, 0, "ANCIENT_DEBRIS")
                .set(0, -1, 0, "DIAMOND_ORE")
                .set(0, 0, 1, "DIAMOND_ORE")
                .set(0, 0, -1, "DIAMOND_ORE");
        assertEquals(6, HiddenOreDetector.revealsFrom(w, 0, 0, 0).size());
    }

    @Test
    void oreAlreadyExposedToAirOrWaterIsNotAReveal() {
        World air = new World().set(1, 0, 0, "DIAMOND_ORE").set(2, 0, 0, "AIR");
        assertTrue(HiddenOreDetector.revealsFrom(air, 0, 0, 0).isEmpty());
        World water = new World().set(1, 0, 0, "DIAMOND_ORE").set(1, 1, 0, "WATER");
        assertTrue(HiddenOreDetector.revealsFrom(water, 0, 0, 0).isEmpty());
        World cave = new World().set(1, 0, 0, "DIAMOND_ORE").set(1, 0, -1, "CAVE_AIR");
        assertTrue(HiddenOreDetector.revealsFrom(cave, 0, 0, 0).isEmpty());
    }

    @Test
    void theFaceTowardTheBrokenBlockIsNotCountedAsExposure() {
        // The broken block itself may already be air in some call orders; it must be ignored.
        World w = new World().set(0, 0, 0, "AIR").set(1, 0, 0, "DIAMOND_ORE");
        assertEquals(1, HiddenOreDetector.revealsFrom(w, 0, 0, 0).size());
    }

    @Test
    void nonTargetNeighboursAreIgnored() {
        World w = new World().set(1, 0, 0, "IRON_ORE").set(0, 1, 0, "COAL_ORE");
        assertTrue(HiddenOreDetector.revealsFrom(w, 0, 0, 0).isEmpty());
    }

    @Test
    void secondBreakNextToAnAlreadyRevealedOreDoesNotReportItAgain() {
        World w = new World().set(1, 0, 0, "DIAMOND_ORE");
        assertEquals(1, HiddenOreDetector.revealsFrom(w, 0, 0, 0).size());
        w.set(0, 0, 0, "AIR"); // the first block is gone now
        assertTrue(HiddenOreDetector.revealsFrom(w, 1, 1, 0).isEmpty(), "ore now has an exposed face");
    }
}
