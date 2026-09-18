package dev.jevcraft.plugin.session;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

/**
 * Mining session lifecycle (spec §7 "セッション境界"). Pure Java: the clock, id factory and
 * pseudonymizer are injected. Players are keyed by real UUID in memory only; sessions carry the
 * pseudonym. Main-thread only; not synchronized.
 */
public final class SessionTracker {

    public record Settings(
            int undergroundStoneBreaksToStart,
            int undergroundYMax,
            long idleTimeoutMs,
            double teleportSplitDistance) {}

    public interface Listener {
        void onSessionStart(UUID player, MiningSession session);

        void onSessionEnd(UUID player, MiningSession session, String reason);
    }

    public static final String START_UNDERGROUND_MINING = "underground_mining";
    public static final String START_ORE = "valuable_ore";
    public static final String END_IDLE = "idle_timeout";
    public static final String END_QUIT = "logout";
    public static final String END_WORLD_CHANGE = "world_change";
    public static final String END_TELEPORT = "teleport";
    public static final String END_GAME_MODE = "game_mode_change";
    public static final String END_FLUSH = "admin_flush";
    public static final String END_SHUTDOWN = "server_shutdown";

    private final Settings settings;
    private final LongSupplier clock;
    private final Supplier<String> idFactory;
    private final Function<UUID, String> pseudonymizer;
    private final Listener listener;
    private final Map<UUID, MiningSession> active = new HashMap<>();
    private final Map<UUID, Integer> pendingStoneBreaks = new HashMap<>();

    public SessionTracker(
            Settings settings,
            LongSupplier clock,
            Supplier<String> idFactory,
            Function<UUID, String> pseudonymizer,
            Listener listener) {
        this.settings = settings;
        this.clock = clock;
        this.idFactory = idFactory;
        this.pseudonymizer = pseudonymizer;
        this.listener = listener;
    }

    public Optional<MiningSession> active(UUID player) {
        return Optional.ofNullable(active.get(player));
    }

    public Map<UUID, MiningSession> snapshot() {
        return Collections.unmodifiableMap(new HashMap<>(active));
    }

    public int pendingStoneBreaks(UUID player) {
        return pendingStoneBreaks.getOrDefault(player, 0);
    }

    /**
     * @param stoneLike stone, deepslate, tuff, etc.
     * @param targetOre one of the configured valuable ores
     * @param reveals number of hidden ores exposed by this break (already detected)
     * @return the session this break belongs to, if any
     */
    public Optional<MiningSession> onBlockBreak(
            UUID player, String world, int y, boolean stoneLike, boolean targetOre, int reveals) {
        long now = clock.getAsLong();
        MiningSession session = active.get(player);
        if (session != null && !session.world().equals(world)) {
            end(player, END_WORLD_CHANGE);
            session = null;
        }
        boolean undergroundStone = stoneLike && y <= settings.undergroundYMax();
        if (session == null) {
            String reason = null;
            if (targetOre || reveals > 0) {
                reason = START_ORE;
            } else if (undergroundStone) {
                int count = pendingStoneBreaks.merge(player, 1, Integer::sum);
                if (count >= settings.undergroundStoneBreaksToStart()) {
                    reason = START_UNDERGROUND_MINING;
                }
            }
            if (reason == null) {
                return Optional.empty();
            }
            session = new MiningSession(idFactory.get(), pseudonymizer.apply(player), world, now, reason);
            active.put(player, session);
            pendingStoneBreaks.remove(player);
            listener.onSessionStart(player, session);
        }
        session.touch(now);
        session.recordBreak(undergroundStone, targetOre);
        session.recordReveals(reveals);
        return Optional.of(session);
    }

    /** Teleport within or across worlds. Large jumps split the session (spec §7). */
    public void onTeleport(UUID player, String fromWorld, String toWorld, double distance) {
        MiningSession session = active.get(player);
        if (session == null) {
            return;
        }
        if (!fromWorld.equals(toWorld)) {
            end(player, END_WORLD_CHANGE);
        } else if (distance > settings.teleportSplitDistance()) {
            end(player, END_TELEPORT);
        }
    }

    public void onWorldChange(UUID player) {
        endIfActive(player, END_WORLD_CHANGE);
    }

    public void onQuit(UUID player) {
        endIfActive(player, END_QUIT);
        pendingStoneBreaks.remove(player);
    }

    public void onGameModeChange(UUID player) {
        endIfActive(player, END_GAME_MODE);
    }

    /** Admin {@code /jevcraft flush <player>}. Returns true when a session was ended. */
    public boolean flush(UUID player) {
        return endIfActive(player, END_FLUSH);
    }

    /** Ends every session, e.g. on server shutdown. */
    public void endAll(String reason) {
        for (UUID player : new ArrayList<>(active.keySet())) {
            end(player, reason);
        }
    }

    /** Call periodically (e.g. once per second) to expire idle sessions. */
    public List<MiningSession> tick() {
        long now = clock.getAsLong();
        List<MiningSession> ended = new ArrayList<>();
        for (Map.Entry<UUID, MiningSession> entry : new ArrayList<>(active.entrySet())) {
            if (now - entry.getValue().lastActivityMs() >= settings.idleTimeoutMs()) {
                ended.add(entry.getValue());
                end(entry.getKey(), END_IDLE);
            }
        }
        return ended;
    }

    private boolean endIfActive(UUID player, String reason) {
        if (!active.containsKey(player)) {
            return false;
        }
        end(player, reason);
        return true;
    }

    private void end(UUID player, String reason) {
        MiningSession session = active.remove(player);
        pendingStoneBreaks.remove(player);
        if (session != null) {
            listener.onSessionEnd(player, session, reason);
        }
    }
}
