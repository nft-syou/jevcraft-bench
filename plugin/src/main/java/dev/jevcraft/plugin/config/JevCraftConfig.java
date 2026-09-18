package dev.jevcraft.plugin.config;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.logging.Logger;
import org.bukkit.Material;
import org.bukkit.configuration.file.FileConfiguration;

/** Typed view of config.yml (spec §17). Unknown ore names are logged and skipped. */
public record JevCraftConfig(
        String mode,
        boolean telemetryEnabled,
        long movementSampleMs,
        double movementSampleDistance,
        double movementSampleDegrees,
        int trajectoryBufferSeconds,
        int sessionIdleTimeoutSeconds,
        int undergroundStoneBreaksToStart,
        int undergroundYMax,
        double teleportSplitDistance,
        String outputDirectory,
        int queueCapacity,
        Set<Material> targetOres,
        String hmacSecretEnvironmentVariable,
        boolean includePlayerName) {

    public static final Set<Material> STONE_LIKE = EnumSet.of(
            Material.STONE,
            Material.DEEPSLATE,
            Material.TUFF,
            Material.GRANITE,
            Material.DIORITE,
            Material.ANDESITE,
            Material.CALCITE,
            Material.DRIPSTONE_BLOCK,
            Material.NETHERRACK,
            Material.BASALT,
            Material.BLACKSTONE);

    public static JevCraftConfig from(FileConfiguration c, Logger log) {
        Set<Material> ores = EnumSet.noneOf(Material.class);
        List<String> names = c.getStringList("ores");
        for (String name : names) {
            Material m = Material.matchMaterial(name);
            if (m == null) {
                log.warning("config.yml ores: unknown material '" + name + "' ignored");
            } else {
                ores.add(m);
            }
        }
        if (ores.isEmpty()) {
            log.warning("config.yml ores is empty; no hidden ore reveals will be recorded");
        }
        return new JevCraftConfig(
                c.getString("mode", "shadow"),
                c.getBoolean("telemetry.enabled", true),
                c.getLong("telemetry.movementSampleMs", 150),
                c.getDouble("telemetry.movementSampleDistance", 0.75),
                c.getDouble("telemetry.movementSampleDegrees", 10.0),
                c.getInt("telemetry.trajectoryBufferSeconds", 90),
                c.getInt("telemetry.sessionIdleTimeoutSeconds", 120),
                c.getInt("telemetry.undergroundStoneBreaksToStart", 10),
                c.getInt("telemetry.undergroundYMax", 40),
                c.getDouble("telemetry.teleportSplitDistance", 32.0),
                c.getString("telemetry.outputDirectory", "plugins/JevCraft/data"),
                c.getInt("telemetry.queueCapacity", 10000),
                ores,
                c.getString("privacy.hmacSecretEnvironmentVariable", "JEVCRAFT_HMAC_SECRET"),
                c.getBoolean("privacy.includePlayerName", false));
    }
}
