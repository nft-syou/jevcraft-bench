package dev.jevcraft.plugin.session;

/** Mutable per-player mining session. Holds only pseudonymous identity. */
public final class MiningSession {
    private final String sessionId;
    private final String playerPseudonym;
    private final String world;
    private final long startedAtMs;
    private final String startReason;
    private long lastActivityMs;
    private int blocksBroken;
    private int undergroundStoneBroken;
    private int oreReveals;
    private int oreBlocksBroken;

    MiningSession(String sessionId, String playerPseudonym, String world, long startedAtMs, String startReason) {
        this.sessionId = sessionId;
        this.playerPseudonym = playerPseudonym;
        this.world = world;
        this.startedAtMs = startedAtMs;
        this.lastActivityMs = startedAtMs;
        this.startReason = startReason;
    }

    public String sessionId() {
        return sessionId;
    }

    public String playerPseudonym() {
        return playerPseudonym;
    }

    public String world() {
        return world;
    }

    public long startedAtMs() {
        return startedAtMs;
    }

    public String startReason() {
        return startReason;
    }

    public long lastActivityMs() {
        return lastActivityMs;
    }

    public int blocksBroken() {
        return blocksBroken;
    }

    public int undergroundStoneBroken() {
        return undergroundStoneBroken;
    }

    public int oreReveals() {
        return oreReveals;
    }

    public int oreBlocksBroken() {
        return oreBlocksBroken;
    }

    void touch(long nowMs) {
        lastActivityMs = nowMs;
    }

    void recordBreak(boolean undergroundStone, boolean targetOre) {
        blocksBroken++;
        if (undergroundStone) {
            undergroundStoneBroken++;
        }
        if (targetOre) {
            oreBlocksBroken++;
        }
    }

    void recordReveals(int count) {
        oreReveals += count;
    }
}
