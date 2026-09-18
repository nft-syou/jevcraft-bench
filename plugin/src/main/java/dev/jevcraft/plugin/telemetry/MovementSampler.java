package dev.jevcraft.plugin.telemetry;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Decides which movement updates are worth recording (time, distance or rotation gate) and
 * keeps a short ring buffer per player so the approach *before* a session starts can be
 * written retroactively (spec §7).
 */
public final class MovementSampler {

    public record Sample(long timeMs, String world, double x, double y, double z, float yaw, float pitch) {
        public double distanceTo(Sample other) {
            double dx = x - other.x;
            double dy = y - other.y;
            double dz = z - other.z;
            return Math.sqrt(dx * dx + dy * dy + dz * dz);
        }

        public double rotationDeltaDegrees(Sample other) {
            return Math.max(angleDelta(yaw, other.yaw), angleDelta(pitch, other.pitch));
        }

        private static double angleDelta(float a, float b) {
            double d = Math.abs(a - b) % 360.0;
            return d > 180.0 ? 360.0 - d : d;
        }
    }

    private final long minIntervalMs;
    private final double minDistance;
    private final double minDegrees;
    private final long bufferMs;
    private final Map<UUID, Sample> last = new HashMap<>();
    private final Map<UUID, Deque<Sample>> buffers = new HashMap<>();

    public MovementSampler(long minIntervalMs, double minDistance, double minDegrees, long bufferMs) {
        this.minIntervalMs = minIntervalMs;
        this.minDistance = minDistance;
        this.minDegrees = minDegrees;
        this.bufferMs = bufferMs;
    }

    /**
     * Returns the sample if it passes a gate (and stores it in the ring buffer), empty otherwise.
     * The first sample for a player always passes.
     */
    public Optional<Sample> accept(UUID player, Sample sample) {
        Sample previous = last.get(player);
        boolean passes = previous == null
                || !previous.world().equals(sample.world())
                || sample.timeMs() - previous.timeMs() >= minIntervalMs
                || sample.distanceTo(previous) >= minDistance
                || sample.rotationDeltaDegrees(previous) >= minDegrees;
        if (!passes) {
            return Optional.empty();
        }
        last.put(player, sample);
        Deque<Sample> buffer = buffers.computeIfAbsent(player, k -> new ArrayDeque<>());
        buffer.addLast(sample);
        while (!buffer.isEmpty() && sample.timeMs() - buffer.peekFirst().timeMs() > bufferMs) {
            buffer.pollFirst();
        }
        return Optional.of(sample);
    }

    /** Forces the next sample through regardless of gates (used right before a block break). */
    public Sample force(UUID player, Sample sample) {
        last.remove(player);
        return accept(player, sample).orElseThrow();
    }

    /** Returns and clears the buffered samples, oldest first. */
    public List<Sample> drainBuffer(UUID player) {
        Deque<Sample> buffer = buffers.remove(player);
        return buffer == null ? List.of() : new ArrayList<>(buffer);
    }

    public int bufferedCount(UUID player) {
        Deque<Sample> buffer = buffers.get(player);
        return buffer == null ? 0 : buffer.size();
    }

    public void forget(UUID player) {
        last.remove(player);
        buffers.remove(player);
    }
}
