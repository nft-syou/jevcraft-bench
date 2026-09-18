package dev.jevcraft.plugin.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class SessionTrackerTest {
    private static final UUID P = UUID.randomUUID();
    private static final UUID Q = UUID.randomUUID();

    private long now;
    private final List<String> events = new ArrayList<>();
    private SessionTracker tracker;

    @BeforeEach
    void setUp() {
        now = 1_000_000;
        AtomicInteger ids = new AtomicInteger();
        tracker = new SessionTracker(
                new SessionTracker.Settings(3, 40, 120_000, 32.0),
                () -> now,
                () -> "session_" + ids.incrementAndGet(),
                uuid -> "hmac-sha256:" + uuid.toString().substring(0, 8),
                new SessionTracker.Listener() {
                    @Override
                    public void onSessionStart(UUID player, MiningSession session) {
                        events.add("start:" + session.sessionId() + ":" + session.startReason());
                    }

                    @Override
                    public void onSessionEnd(UUID player, MiningSession session, String reason) {
                        events.add("end:" + session.sessionId() + ":" + reason);
                    }
                });
    }

    @Test
    void startsAfterEnoughUndergroundStoneBreaks() {
        assertTrue(tracker.onBlockBreak(P, "world", 10, true, false, 0).isEmpty());
        assertTrue(tracker.onBlockBreak(P, "world", 10, true, false, 0).isEmpty());
        assertEquals(2, tracker.pendingStoneBreaks(P));
        MiningSession s = tracker.onBlockBreak(P, "world", 10, true, false, 0).orElseThrow();
        assertEquals("session_1", s.sessionId());
        assertEquals(SessionTracker.START_UNDERGROUND_MINING, s.startReason());
        assertEquals(1, s.blocksBroken(), "only the starting break is counted inside the session");
        assertEquals(List.of("start:session_1:underground_mining"), events);
        assertTrue(s.playerPseudonym().startsWith("hmac-sha256:"));
    }

    @Test
    void stoneAboveTheUndergroundLimitDoesNotStartASession() {
        for (int i = 0; i < 10; i++) {
            assertTrue(tracker.onBlockBreak(P, "world", 70, true, false, 0).isEmpty());
        }
        assertEquals(0, tracker.pendingStoneBreaks(P));
    }

    @Test
    void anOreRevealOrOreBreakStartsImmediately() {
        MiningSession s = tracker.onBlockBreak(P, "world", 70, true, false, 2).orElseThrow();
        assertEquals(SessionTracker.START_ORE, s.startReason());
        assertEquals(2, s.oreReveals());
        MiningSession t = tracker.onBlockBreak(Q, "world", -50, false, true, 0).orElseThrow();
        assertEquals(1, t.oreBlocksBroken());
        assertNotEquals(s.sessionId(), t.sessionId());
    }

    @Test
    void idleTimeoutEndsTheSessionAndTheNextOneGetsANewId() {
        tracker.onBlockBreak(P, "world", 10, false, true, 0);
        now += 119_999;
        assertTrue(tracker.tick().isEmpty());
        now += 1;
        assertEquals(1, tracker.tick().size());
        assertTrue(tracker.active(P).isEmpty());
        assertEquals("end:session_1:idle_timeout", events.get(1));
        assertEquals("session_2", tracker.onBlockBreak(P, "world", 10, false, true, 0).orElseThrow().sessionId());
    }

    @Test
    void activityResetsTheIdleClock() {
        tracker.onBlockBreak(P, "world", 10, false, true, 0);
        now += 100_000;
        tracker.onBlockBreak(P, "world", 10, true, false, 0);
        now += 100_000;
        assertTrue(tracker.tick().isEmpty());
    }

    @Test
    void farTeleportEndsButShortTeleportDoesNot() {
        tracker.onBlockBreak(P, "world", 10, false, true, 0);
        tracker.onTeleport(P, "world", "world", 10.0);
        assertTrue(tracker.active(P).isPresent());
        tracker.onTeleport(P, "world", "world", 32.5);
        assertTrue(tracker.active(P).isEmpty());
        assertEquals("end:session_1:teleport", events.get(1));
    }

    @Test
    void worldChangeQuitGameModeAndFlushEndWithTheirReasons() {
        tracker.onBlockBreak(P, "world", 10, false, true, 0);
        tracker.onWorldChange(P);
        tracker.onBlockBreak(P, "world_nether", 10, false, true, 0);
        tracker.onQuit(P);
        tracker.onBlockBreak(P, "world", 10, false, true, 0);
        tracker.onGameModeChange(P);
        tracker.onBlockBreak(P, "world", 10, false, true, 0);
        assertTrue(tracker.flush(P));
        assertFalse(tracker.flush(P), "nothing left to flush");
        assertEquals(
                List.of("world_change", "logout", "game_mode_change", "admin_flush"),
                events.stream().filter(e -> e.startsWith("end:")).map(e -> e.split(":")[2]).toList());
    }

    @Test
    void breakingInAnotherWorldSplitsTheSession() {
        tracker.onBlockBreak(P, "world", 10, false, true, 0);
        MiningSession s = tracker.onBlockBreak(P, "world_nether", 10, false, true, 0).orElseThrow();
        assertEquals("session_2", s.sessionId());
        assertEquals("end:session_1:world_change", events.get(1));
    }

    @Test
    void endAllEndsEverySessionWithTheGivenReason() {
        tracker.onBlockBreak(P, "world", 10, false, true, 0);
        tracker.onBlockBreak(Q, "world", 10, false, true, 0);
        tracker.endAll(SessionTracker.END_SHUTDOWN);
        assertTrue(tracker.snapshot().isEmpty());
        assertEquals(2, events.stream().filter(e -> e.endsWith(":server_shutdown")).count());
    }
}
