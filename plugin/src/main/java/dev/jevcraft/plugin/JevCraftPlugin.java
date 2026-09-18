package dev.jevcraft.plugin;

import dev.jevcraft.plugin.command.JevCraftCommand;
import dev.jevcraft.plugin.config.JevCraftConfig;
import dev.jevcraft.plugin.listener.MiningListener;
import dev.jevcraft.plugin.telemetry.JsonlWriter;
import dev.jevcraft.plugin.telemetry.PlayerPseudonymizer;
import dev.jevcraft.plugin.telemetry.TelemetryService;
import java.io.IOException;
import java.nio.file.Path;
import java.time.Clock;
import java.time.format.DateTimeFormatter;
import java.time.ZoneOffset;
import java.util.UUID;
import org.bukkit.command.PluginCommand;
import org.bukkit.plugin.java.JavaPlugin;

public class JevCraftPlugin extends JavaPlugin {
    private TelemetryService service;
    private Path outputFile;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        JevCraftConfig config = JevCraftConfig.from(getConfig(), getLogger());
        if (!"shadow".equals(config.mode())) {
            getLogger().warning("mode '" + config.mode() + "' is not supported; running in shadow mode");
        }
        if (!config.telemetryEnabled()) {
            getLogger().info("telemetry.enabled=false; JevCraft is idle");
            return;
        }

        PlayerPseudonymizer pseudonymizer = resolvePseudonymizer(config);
        String serverRunId = "run_" + DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss").withZone(ZoneOffset.UTC)
                .format(Clock.systemUTC().instant()) + "_" + UUID.randomUUID().toString().substring(0, 8);
        outputFile = resolveOutputDirectory(config.outputDirectory()).resolve(serverRunId + ".jsonl");

        JsonlWriter writer;
        try {
            writer = new JsonlWriter(
                    JsonlWriter.fileSink(outputFile),
                    config.queueCapacity(),
                    t -> getLogger().warning("telemetry write failed: " + t));
        } catch (IOException e) {
            getLogger().severe("cannot open " + outputFile + ": " + e + "; JevCraft is idle");
            return;
        }

        service = new TelemetryService(config, getLogger(), Clock.systemUTC(), serverRunId, writer, pseudonymizer);
        getServer().getPluginManager().registerEvents(new MiningListener(service), this);
        PluginCommand command = getCommand("jevcraft");
        if (command != null) {
            JevCraftCommand executor = new JevCraftCommand(service);
            command.setExecutor(executor);
            command.setTabCompleter(executor);
        }
        getServer().getScheduler().runTaskTimer(this, () -> service.tick(), 20L, 20L);
        getLogger().info("JevCraft enabled in shadow mode (records only, never punishes). Writing " + outputFile);
    }

    @Override
    public void onDisable() {
        getServer().getScheduler().cancelTasks(this);
        if (service != null) {
            service.shutdown();
            service = null;
        }
        getLogger().info("JevCraft disabled");
    }

    /** Exposed for tests and diagnostics. */
    public TelemetryService service() {
        return service;
    }

    public Path outputFile() {
        return outputFile;
    }

    private PlayerPseudonymizer resolvePseudonymizer(JevCraftConfig config) {
        String secret = System.getenv(config.hmacSecretEnvironmentVariable());
        if (secret == null || secret.isBlank()) {
            getLogger().warning(config.hmacSecretEnvironmentVariable()
                    + " is not set; player ids will be pseudonymous but NOT stable across restarts");
            return PlayerPseudonymizer.randomForThisRun();
        }
        return PlayerPseudonymizer.fromSecret(secret);
    }

    /** Relative paths are resolved against the server root (two levels above plugins/JevCraft). */
    private Path resolveOutputDirectory(String configured) {
        Path p = Path.of(configured);
        if (p.isAbsolute()) {
            return p;
        }
        Path dataFolder = getDataFolder().toPath().toAbsolutePath();
        Path root = dataFolder.getParent() != null && dataFolder.getParent().getParent() != null
                ? dataFolder.getParent().getParent()
                : dataFolder;
        return root.resolve(p);
    }
}
