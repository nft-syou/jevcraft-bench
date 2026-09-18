package dev.jevcraft.plugin.telemetry;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class TelemetryEventTest {
    @Test
    void producesOneLineWithTheEnvelopeAndNullForMissingSession() {
        JsonObject ore = new JsonObject();
        ore.addProperty("material", "DIAMOND_ORE");
        String line = TelemetryEvent.of("hidden_ore_reveal", Instant.parse("2026-09-19T00:00:00Z"))
                .serverRunId("run_1")
                .sessionId(null)
                .playerId("hmac-sha256:abc")
                .world("world")
                .blockPosition(1, -52, 3)
                .put("revealedOre", ore)
                .put("note", (String) null)
                .toJsonLine();
        assertFalse(line.contains("\n"));
        JsonObject parsed = JsonParser.parseString(line).getAsJsonObject();
        assertEquals(1, parsed.get("schemaVersion").getAsInt());
        assertEquals("hidden_ore_reveal", parsed.get("eventType").getAsString());
        assertEquals("2026-09-19T00:00:00Z", parsed.get("occurredAt").getAsString());
        assertTrue(parsed.get("sessionId").isJsonNull());
        assertTrue(parsed.get("note").isJsonNull());
        assertEquals(-52, parsed.getAsJsonObject("position").get("y").getAsInt());
        assertEquals("DIAMOND_ORE", parsed.getAsJsonObject("revealedOre").get("material").getAsString());
        assertEquals(36, parsed.get("eventId").getAsString().length());
    }
}
