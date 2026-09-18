package dev.jevcraft.plugin.telemetry;

import com.google.gson.JsonObject;
import dev.jevcraft.plugin.config.JevCraftConfig;
import dev.jevcraft.plugin.ore.BukkitBlockAccess;
import dev.jevcraft.plugin.ore.HiddenOreDetector;
import dev.jevcraft.plugin.ore.HiddenOreDetector.RevealedOre;
import dev.jevcraft.plugin.session.MiningSession;
import dev.jevcraft.plugin.session.SessionTracker;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.logging.Logger;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.block.Block;
import org.bukkit.entity.Player;

/**
 * Glue between Bukkit objects and the pure core. Every public method except {@link #shutdown()}
 * runs on the main thread; the only off-thread work is the writer's drain thread.
 */
public final class TelemetryService implements SessionTracker.Listener {
    public static final String EV_MOVEMENT = "movement_sample";
    public static final String EV_BLOCK_BREAK = "block_break";
    public static final String EV_ORE_REVEAL = "hidden_ore_reveal";
    public static final String EV_SESSION_START = "session_start";
    public static final String EV_SESSION_END = "session_end";

    private final JevCraftConfig config;
    private final Logger log;
    private final Clock clock;
    private final String serverRunId;
    private final JsonlWriter writer;
    private final PlayerPseudonymizer pseudonymizer;
    private final MovementSampler sampler;
    private final SessionTracker tracker;

    public TelemetryService(
            JevCraftConfig config,
            Logger log,
            Clock clock,
            String serverRunId,
            JsonlWriter writer,
            PlayerPseudonymizer pseudonymizer) {
        this.config = config;
        this.log = log;
        this.clock = clock;
        this.serverRunId = serverRunId;
        this.writer = writer;
        this.pseudonymizer = pseudonymizer;
        this.sampler = new MovementSampler(
                config.movementSampleMs(),
                config.movementSampleDistance(),
                config.movementSampleDegrees(),
                TimeUnit.SECONDS.toMillis(config.trajectoryBufferSeconds()));
        this.tracker = new SessionTracker(
                new SessionTracker.Settings(
                        config.undergroundStoneBreaksToStart(),
                        config.undergroundYMax(),
                        TimeUnit.SECONDS.toMillis(config.sessionIdleTimeoutSeconds()),
                        config.teleportSplitDistance()),
                clock::millis,
                () -> "session_" + UUID.randomUUID(),
                pseudonymizer::pseudonymize,
                this);
    }

    public String serverRunId() {
        return serverRunId;
    }

    public SessionTracker tracker() {
        return tracker;
    }

    public JsonlWriter writer() {
        return writer;
    }

    // ---- Bukkit-facing entry points -------------------------------------------------------

    public void recordMovement(Player player, Location to) {
        MovementSampler.Sample sample = sampleOf(to);
        Optional<MovementSampler.Sample> accepted = sampler.accept(player.getUniqueId(), sample);
        if (accepted.isEmpty()) {
            return;
        }
        tracker.active(player.getUniqueId())
                .ifPresent(session -> writeMovement(player, session.sessionId(), accepted.get(), false));
    }

    /** Call from BlockBreakEvent at MONITOR priority, while the block still exists. */
    public void recordBlockBreak(Player player, Block block) {
        Material type = block.getType();
        boolean targetOre = config.targetOres().contains(type);
        boolean stoneLike = JevCraftConfig.STONE_LIKE.contains(type);
        List<RevealedOre> reveals = HiddenOreDetector.revealsFrom(
                new BukkitBlockAccess(block.getWorld(), config.targetOres()),
                block.getX(),
                block.getY(),
                block.getZ());

        // Make sure the position right before the break is in the trajectory.
        sampler.force(player.getUniqueId(), sampleOf(player.getLocation()));

        Optional<MiningSession> session = tracker.onBlockBreak(
                player.getUniqueId(), block.getWorld().getName(), block.getY(), stoneLike, targetOre, reveals.size());
        if (session.isEmpty()) {
            return;
        }
        String sessionId = session.get().sessionId();
        String playerId = session.get().playerPseudonym();
        JsonObject context = breakContext(player, block);

        JsonObject blockJson = new JsonObject();
        blockJson.addProperty("material", type.name());
        blockJson.addProperty("targetOre", targetOre);
        blockJson.addProperty("stoneLike", stoneLike);
        write(TelemetryEvent.of(EV_BLOCK_BREAK, now())
                .serverRunId(serverRunId)
                .sessionId(sessionId)
                .playerId(playerId)
                .world(block.getWorld().getName())
                .blockPosition(block.getX(), block.getY(), block.getZ())
                .put("block", blockJson)
                .put("context", context));

        for (RevealedOre ore : reveals) {
            JsonObject oreJson = new JsonObject();
            oreJson.addProperty("material", ore.material());
            oreJson.addProperty("x", ore.x());
            oreJson.addProperty("y", ore.y());
            oreJson.addProperty("z", ore.z());
            oreJson.addProperty("previouslyVisible", false);
            write(TelemetryEvent.of(EV_ORE_REVEAL, now())
                    .serverRunId(serverRunId)
                    .sessionId(sessionId)
                    .playerId(playerId)
                    .world(block.getWorld().getName())
                    .blockPosition(block.getX(), block.getY(), block.getZ())
                    .put("revealedOre", oreJson)
                    .put("context", context));
        }
    }

    public void recordTeleport(Player player, Location from, Location to) {
        String fromWorld = from.getWorld() == null ? "" : from.getWorld().getName();
        String toWorld = to.getWorld() == null ? "" : to.getWorld().getName();
        double distance = fromWorld.equals(toWorld) ? from.distance(to) : Double.MAX_VALUE;
        tracker.onTeleport(player.getUniqueId(), fromWorld, toWorld, distance);
    }

    public void recordWorldChange(Player player) {
        tracker.onWorldChange(player.getUniqueId());
        sampler.forget(player.getUniqueId());
    }

    public void recordGameModeChange(Player player) {
        tracker.onGameModeChange(player.getUniqueId());
    }

    public void recordQuit(Player player) {
        tracker.onQuit(player.getUniqueId());
        sampler.forget(player.getUniqueId());
    }

    public boolean flush(UUID player) {
        return tracker.flush(player);
    }

    /** Once per second from the scheduler. */
    public void tick() {
        tracker.tick();
    }

    public Map<String, Object> metrics() {
        return Map.of(
                "serverRunId", serverRunId,
                "activeSessions", tracker.snapshot().size(),
                "linesWritten", writer.writtenCount(),
                "linesDropped", writer.droppedCount(),
                "queueSize", writer.queueSize(),
                "ephemeralIds", pseudonymizer.isEphemeral());
    }

    /** Ends every session and drains the writer. Safe to call from onDisable. */
    public void shutdown() {
        tracker.endAll(SessionTracker.END_SHUTDOWN);
        writer.close();
    }

    // ---- SessionTracker.Listener ----------------------------------------------------------

    @Override
    public void onSessionStart(UUID player, MiningSession session) {
        JsonObject s = new JsonObject();
        s.addProperty("reason", session.startReason());
        TelemetryEvent event = TelemetryEvent.of(EV_SESSION_START, now())
                .serverRunId(serverRunId)
                .sessionId(session.sessionId())
                .playerId(session.playerPseudonym())
                .world(session.world())
                .put("session", s);
        Player online = org.bukkit.Bukkit.getPlayer(player);
        if (online != null) {
            Location l = online.getLocation();
            event.position(l.getX(), l.getY(), l.getZ());
            if (config.includePlayerName()) {
                event.put("playerName", online.getName());
            }
        } else {
            event.put("position", (String) null);
        }
        write(event);
        // Retroactively persist the approach before the session started.
        if (online != null) {
            for (MovementSampler.Sample sample : sampler.drainBuffer(player)) {
                writeMovement(online, session.sessionId(), sample, true);
            }
        }
    }

    @Override
    public void onSessionEnd(UUID player, MiningSession session, String reason) {
        JsonObject s = new JsonObject();
        s.addProperty("reason", reason);
        s.addProperty("durationSec", (clock.millis() - session.startedAtMs()) / 1000.0);
        s.addProperty("blocksBroken", session.blocksBroken());
        s.addProperty("undergroundStoneBroken", session.undergroundStoneBroken());
        s.addProperty("oreReveals", session.oreReveals());
        s.addProperty("oreBlocksBroken", session.oreBlocksBroken());
        TelemetryEvent event = TelemetryEvent.of(EV_SESSION_END, now())
                .serverRunId(serverRunId)
                .sessionId(session.sessionId())
                .playerId(session.playerPseudonym())
                .world(session.world())
                .put("session", s);
        Player online = org.bukkit.Bukkit.getPlayer(player);
        if (online != null) {
            Location l = online.getLocation();
            event.position(l.getX(), l.getY(), l.getZ());
        } else {
            event.put("position", (String) null);
        }
        write(event);
    }

    // ---- helpers ----------------------------------------------------------------------------

    private Instant now() {
        return clock.instant();
    }

    private MovementSampler.Sample sampleOf(Location l) {
        String world = l.getWorld() == null ? "" : l.getWorld().getName();
        return new MovementSampler.Sample(
                clock.millis(), world, l.getX(), l.getY(), l.getZ(), l.getYaw(), l.getPitch());
    }

    private void writeMovement(Player player, String sessionId, MovementSampler.Sample s, boolean preSession) {
        JsonObject rotation = new JsonObject();
        rotation.addProperty("yaw", s.yaw());
        rotation.addProperty("pitch", s.pitch());
        JsonObject movement = new JsonObject();
        movement.addProperty("sampledAtMs", s.timeMs());
        movement.addProperty("preSession", preSession);
        write(TelemetryEvent.of(EV_MOVEMENT, Instant.ofEpochMilli(s.timeMs()))
                .serverRunId(serverRunId)
                .sessionId(sessionId)
                .playerId(pseudonymizer.pseudonymize(player.getUniqueId()))
                .world(s.world())
                .position(s.x(), s.y(), s.z())
                .put("rotation", rotation)
                .put("movement", movement));
    }

    private JsonObject breakContext(Player player, Block block) {
        JsonObject context = new JsonObject();
        context.addProperty("gameMode", player.getGameMode().name());
        context.addProperty("tool", player.getInventory().getItemInMainHand().getType().name());
        context.addProperty("lightLevel", block.getLightLevel());
        context.addProperty("underground", block.getY() <= config.undergroundYMax());
        return context;
    }

    private void write(TelemetryEvent event) {
        if (!writer.offer(event.toJsonLine()) && writer.droppedCount() % 1000 == 1) {
            log.warning("telemetry queue full; dropped " + writer.droppedCount() + " lines so far");
        }
    }
}
