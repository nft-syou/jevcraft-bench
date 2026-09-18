package dev.jevcraft.plugin.ore;

/** Minimal read-only view of a world so the ore rule can be tested without Bukkit. */
public interface BlockAccess {
    /** True when the block is one of the configured valuable ores. */
    boolean isTargetOre(int x, int y, int z);

    /** True when the block fully hides what is behind it (stone, deepslate, ore...). Air, water, glass are not occluding. */
    boolean isOccluding(int x, int y, int z);

    /** Material name for reporting, e.g. {@code DEEPSLATE_DIAMOND_ORE}. */
    String materialName(int x, int y, int z);
}
