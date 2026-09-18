package dev.jevcraft.plugin;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class SmokeTest {
    @Test
    void toolchainWorks() {
        assertEquals(25, Runtime.version().feature());
    }
}
