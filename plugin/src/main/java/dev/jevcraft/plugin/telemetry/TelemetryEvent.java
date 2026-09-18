package dev.jevcraft.plugin.telemetry;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import java.time.Instant;
import java.util.UUID;

/**
 * One raw telemetry line (spec §8). Every event carries the common envelope; type-specific
 * data goes in named objects such as {@code block}, {@code revealedOre}, {@code movement},
 * {@code session}. Missing values are JSON {@code null}, never 0.
 */
public final class TelemetryEvent {
    public static final int SCHEMA_VERSION = 1;
    private static final Gson GSON = new GsonBuilder().serializeNulls().create();

    private final JsonObject root = new JsonObject();

    private TelemetryEvent(String eventType, Instant occurredAt) {
        root.addProperty("schemaVersion", SCHEMA_VERSION);
        root.addProperty("eventId", UUID.randomUUID().toString());
        root.addProperty("eventType", eventType);
        root.addProperty("occurredAt", occurredAt.toString());
    }

    public static TelemetryEvent of(String eventType, Instant occurredAt) {
        return new TelemetryEvent(eventType, occurredAt);
    }

    public TelemetryEvent serverRunId(String serverRunId) {
        root.addProperty("serverRunId", serverRunId);
        return this;
    }

    public TelemetryEvent sessionId(String sessionId) {
        if (sessionId == null) {
            root.add("sessionId", JsonNull.INSTANCE);
        } else {
            root.addProperty("sessionId", sessionId);
        }
        return this;
    }

    public TelemetryEvent playerId(String pseudonymousId) {
        root.addProperty("playerId", pseudonymousId);
        return this;
    }

    public TelemetryEvent world(String world) {
        root.addProperty("world", world);
        return this;
    }

    public TelemetryEvent blockPosition(int x, int y, int z) {
        JsonObject pos = new JsonObject();
        pos.addProperty("x", x);
        pos.addProperty("y", y);
        pos.addProperty("z", z);
        root.add("position", pos);
        return this;
    }

    public TelemetryEvent position(double x, double y, double z) {
        JsonObject pos = new JsonObject();
        pos.addProperty("x", x);
        pos.addProperty("y", y);
        pos.addProperty("z", z);
        root.add("position", pos);
        return this;
    }

    public TelemetryEvent put(String key, JsonElement value) {
        root.add(key, value == null ? JsonNull.INSTANCE : value);
        return this;
    }

    public TelemetryEvent put(String key, String value) {
        if (value == null) {
            root.add(key, JsonNull.INSTANCE);
        } else {
            root.addProperty(key, value);
        }
        return this;
    }

    public JsonObject json() {
        return root;
    }

    /** Single-line JSON, safe to append to a JSONL file. */
    public String toJsonLine() {
        return GSON.toJson(root);
    }
}
