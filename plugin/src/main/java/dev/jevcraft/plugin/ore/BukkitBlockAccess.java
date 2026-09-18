package dev.jevcraft.plugin.ore;

import java.util.Set;
import org.bukkit.Material;
import org.bukkit.World;

/** {@link BlockAccess} over a live Bukkit world. Main thread only. */
public final class BukkitBlockAccess implements BlockAccess {
    private final World world;
    private final Set<Material> targetOres;

    public BukkitBlockAccess(World world, Set<Material> targetOres) {
        this.world = world;
        this.targetOres = targetOres;
    }

    @Override
    public boolean isTargetOre(int x, int y, int z) {
        return targetOres.contains(world.getBlockAt(x, y, z).getType());
    }

    @Override
    public boolean isOccluding(int x, int y, int z) {
        return world.getBlockAt(x, y, z).getType().isOccluding();
    }

    @Override
    public String materialName(int x, int y, int z) {
        return world.getBlockAt(x, y, z).getType().name();
    }
}
