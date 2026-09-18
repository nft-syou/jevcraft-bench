package dev.jevcraft.plugin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.TimeUnit;
import net.kyori.adventure.text.Component;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockbukkit.mockbukkit.MockBukkit;
import org.mockbukkit.mockbukkit.ServerMock;
import org.mockbukkit.mockbukkit.entity.PlayerMock;
import org.mockbukkit.mockbukkit.world.WorldMock;

/**
 * End-to-end through MockBukkit: a player tunnels underground, exposes a buried diamond ore,
 * then quits. The JSONL must contain the session lifecycle and never a raw UUID or name.
 */
class PluginIntegrationTest {
    private ServerMock server;
    private JevCraftPlugin plugin;

    @BeforeEach
    void setUp() {
        server = MockBukkit.mock();
        plugin = MockBukkit.load(JevCraftPlugin.class);
    }

    @AfterEach
    void tearDown() {
        MockBukkit.unmock();
    }

    @Test
    void recordsAMiningSessionWithAHiddenOreReveal() throws Exception {
        assertNotNull(plugin.service(), "plugin must be active with the default config");
        WorldMock world = server.addSimpleWorld("world");
        int y = 10; // MockBukkit simple worlds start at y=0; still below undergroundYMax (40)
        for (int x = -5; x <= 20; x++) {
            for (int z = -3; z <= 3; z++) {
                for (int dy = -2; dy <= 2; dy++) {
                    world.getBlockAt(x, y + dy, z).setType(Material.DEEPSLATE);
                }
            }
        }
        // Buried ore next to the block at x=12: every face solid.
        world.getBlockAt(12, y, 1).setType(Material.DEEPSLATE_DIAMOND_ORE);
        // Ore already open to a cave: must not be reported.
        world.getBlockAt(15, y, 1).setType(Material.DEEPSLATE_DIAMOND_ORE);
        world.getBlockAt(15, y, 2).setType(Material.CAVE_AIR);

        PlayerMock player = server.addPlayer("Steve");
        player.setLocation(new Location(world, -2.5, y, 0.5));

        // Approach: a few movement samples before any digging (should land in the ring buffer).
        for (int i = 0; i < 3; i++) {
            Location from = player.getLocation();
            Location to = from.clone().add(0.5, 0, 0);
            player.setLocation(to);
            server.getPluginManager().callEvent(new PlayerMoveEvent(player, from, to));
            Thread.sleep(160);
        }

        // Tunnel along x: 10 deepslate breaks start the session, then the block next to the ore.
        for (int x = 0; x <= 12; x++) {
            player.setLocation(new Location(world, x - 0.5, y, 0.5));
            assertTrue(player.breakBlock(world.getBlockAt(x, y, 0)));
        }
        assertTrue(player.breakBlock(world.getBlockAt(15, y, 0))); // next to the cave-exposed ore

        server.getPluginManager().callEvent(
                new PlayerQuitEvent(player, Component.text("bye"), PlayerQuitEvent.QuitReason.DISCONNECTED));
        assertTrue(plugin.service().writer().flush(5, TimeUnit.SECONDS));

        Path file = plugin.outputFile();
        List<JsonObject> events = Files.readAllLines(file).stream()
                .map(line -> JsonParser.parseString(line).getAsJsonObject())
                .toList();
        List<String> types = events.stream().map(e -> e.get("eventType").getAsString()).toList();

        assertEquals(1, types.stream().filter("session_start"::equals).count());
        assertEquals(1, types.stream().filter("session_end"::equals).count());
        assertEquals(1, types.stream().filter("hidden_ore_reveal"::equals).count(), "only the buried ore");
        assertEquals(5, types.stream().filter("block_break"::equals).count(),
                "the 10th break starts the session and is counted; then x=10..12 and x=15");
        assertTrue(types.stream().filter("movement_sample"::equals).count() >= 3, "pre-session buffer was flushed");
        assertEquals("session_start", types.get(0));

        JsonObject reveal = events.stream().filter(e -> "hidden_ore_reveal".equals(e.get("eventType").getAsString())).findFirst().orElseThrow();
        JsonObject ore = reveal.getAsJsonObject("revealedOre");
        assertEquals("DEEPSLATE_DIAMOND_ORE", ore.get("material").getAsString());
        assertEquals(12, ore.get("x").getAsInt());
        assertEquals(1, ore.get("z").getAsInt());
        assertFalse(ore.get("previouslyVisible").getAsBoolean());
        assertEquals("SURVIVAL", reveal.getAsJsonObject("context").get("gameMode").getAsString());

        JsonObject end = events.get(events.size() - 1);
        assertEquals("session_end", end.get("eventType").getAsString());
        assertEquals("logout", end.getAsJsonObject("session").get("reason").getAsString());
        assertEquals(1, end.getAsJsonObject("session").get("oreReveals").getAsInt());

        String all = Files.readString(file);
        assertFalse(all.contains(player.getUniqueId().toString()), "raw UUID must never be written");
        assertFalse(all.contains("Steve"), "player name must never be written by default");
        for (JsonObject e : events) {
            assertTrue(e.get("playerId").getAsString().startsWith("hmac-sha256:"));
            assertEquals(1, e.get("schemaVersion").getAsInt());
            assertEquals(plugin.service().serverRunId(), e.get("serverRunId").getAsString());
            assertFalse(e.get("sessionId").isJsonNull(), "every line here belongs to the session");
        }

        // Keep a copy for the TypeScript schema test.
        Path sample = Path.of("build", "sample-telemetry.jsonl");
        Files.createDirectories(sample.getParent());
        Files.copy(file, sample, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
    }

    @Test
    void statusAndMetricsCommandsWorkForOps() {
        PlayerMock admin = server.addPlayer("Admin");
        admin.setOp(true);
        assertTrue(server.dispatchCommand(admin, "jevcraft status"));
        String status = admin.nextMessage();
        assertTrue(status != null && status.contains("active sessions: 0"), "got: " + status);
        assertTrue(server.dispatchCommand(admin, "jevcraft metrics"));
        assertNotNull(admin.nextMessage());
        while (admin.nextMessage() != null) {
            // drain the remaining metric lines
        }
        assertTrue(server.dispatchCommand(admin, "jevcraft flush Nobody"));
        assertTrue(admin.nextMessage().contains("not online"));
    }

    @Test
    void disableFlushesAndDoesNotThrowWhenNothingHappened() {
        plugin.onDisable();
        plugin.onDisable();
    }
}
