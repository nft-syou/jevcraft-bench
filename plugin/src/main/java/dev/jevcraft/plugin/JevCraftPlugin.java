package dev.jevcraft.plugin;

import org.bukkit.plugin.java.JavaPlugin;

public final class JevCraftPlugin extends JavaPlugin {

    @Override
    public void onEnable() {
        saveDefaultConfig();
        getLogger().info("JevCraft enabled (shadow mode: records only, never punishes)");
    }

    @Override
    public void onDisable() {
        getLogger().info("JevCraft disabled");
    }
}
