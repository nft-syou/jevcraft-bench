package dev.jevcraft.plugin.telemetry;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.jevcraft.plugin.telemetry.MovementSampler.Sample;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class MovementSamplerTest {
    private static final UUID P = UUID.randomUUID();

    private static Sample at(long t, double x, double z, float yaw) {
        return new Sample(t, "world", x, 64, z, yaw, 0f);
    }

    private MovementSampler sampler() {
        return new MovementSampler(150, 0.75, 10.0, 90_000);
    }

    @Test
    void firstSampleAlwaysPassesThenGatesApply() {
        MovementSampler s = sampler();
        assertTrue(s.accept(P, at(0, 0, 0, 0)).isPresent());
        assertFalse(s.accept(P, at(50, 0.1, 0, 1)).isPresent(), "too soon, too close, too small a turn");
        assertTrue(s.accept(P, at(150, 0.1, 0, 1)).isPresent(), "time gate");
        assertTrue(s.accept(P, at(160, 1.0, 0, 1)).isPresent(), "distance gate");
        assertTrue(s.accept(P, at(170, 1.0, 0, 12)).isPresent(), "rotation gate");
        assertTrue(s.accept(P, at(180, 1.0, 0, 358)).isPresent(), "rotation wraps around 360");
    }

    @Test
    void worldChangeAlwaysPasses() {
        MovementSampler s = sampler();
        s.accept(P, at(0, 0, 0, 0));
        assertTrue(s.accept(P, new Sample(10, "nether", 0, 64, 0, 0f, 0f)).isPresent());
    }

    @Test
    void ringBufferKeepsOnlyTheWindowAndDrainClears() {
        MovementSampler s = new MovementSampler(0, 0, 0, 1_000);
        s.accept(P, at(0, 0, 0, 0));
        s.accept(P, at(500, 1, 0, 0));
        s.accept(P, at(1_600, 2, 0, 0)); // evicts t=0 and t=500 (older than 1s)
        assertEquals(1, s.bufferedCount(P));
        s.accept(P, at(2_000, 3, 0, 0));
        List<Sample> drained = s.drainBuffer(P);
        assertEquals(List.of(1_600L, 2_000L), drained.stream().map(Sample::timeMs).toList());
        assertEquals(0, s.bufferedCount(P));
    }

    @Test
    void forceBypassesGatesAndForgetDropsState() {
        MovementSampler s = sampler();
        s.accept(P, at(0, 0, 0, 0));
        assertEquals(0.0, s.force(P, at(1, 0, 0, 0)).x());
        assertEquals(2, s.bufferedCount(P));
        s.forget(P);
        assertEquals(0, s.bufferedCount(P));
        assertTrue(s.accept(P, at(2, 0, 0, 0)).isPresent());
    }
}
