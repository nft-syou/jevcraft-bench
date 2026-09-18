package dev.jevcraft.plugin.command;

import dev.jevcraft.plugin.session.MiningSession;
import dev.jevcraft.plugin.telemetry.TelemetryService;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.kyori.adventure.text.Component;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabExecutor;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;

/**
 * {@code /jevcraft status|session <player>|flush <player>|metrics}. Read-only except flush,
 * which only ends a telemetry session. There is deliberately no punish/kick/ban here.
 */
public final class JevCraftCommand implements TabExecutor {
    private final TelemetryService service;

    public JevCraftCommand(TelemetryService service) {
        this.service = service;
    }

    @Override
    public boolean onCommand(
            @NotNull CommandSender sender, @NotNull Command command, @NotNull String label, String[] args) {
        if (args.length == 0) {
            sender.sendMessage(Component.text("usage: /jevcraft <status|session <player>|flush <player>|metrics>"));
            return true;
        }
        switch (args[0].toLowerCase()) {
            case "status" -> status(sender);
            case "metrics" -> metrics(sender);
            case "session" -> session(sender, args);
            case "flush" -> flush(sender, args);
            default -> sender.sendMessage(Component.text("unknown subcommand: " + args[0]));
        }
        return true;
    }

    private void status(CommandSender sender) {
        Map<UUID, MiningSession> active = service.tracker().snapshot();
        sender.sendMessage(Component.text("JevCraft shadow mode | run " + service.serverRunId()
                + " | active sessions: " + active.size()));
        for (Map.Entry<UUID, MiningSession> e : active.entrySet()) {
            Player p = Bukkit.getPlayer(e.getKey());
            sender.sendMessage(Component.text("  " + (p == null ? e.getKey() : p.getName()) + " -> " + describe(e.getValue())));
        }
    }

    private void metrics(CommandSender sender) {
        for (Map.Entry<String, Object> e : service.metrics().entrySet()) {
            sender.sendMessage(Component.text(e.getKey() + ": " + e.getValue()));
        }
    }

    private void session(CommandSender sender, String[] args) {
        Player target = targetOf(sender, args);
        if (target == null) {
            return;
        }
        sender.sendMessage(Component.text(service.tracker()
                .active(target.getUniqueId())
                .map(JevCraftCommand::describe)
                .orElse(target.getName() + ": no active session")));
    }

    private void flush(CommandSender sender, String[] args) {
        Player target = targetOf(sender, args);
        if (target == null) {
            return;
        }
        boolean ended = service.flush(target.getUniqueId());
        sender.sendMessage(Component.text(ended
                ? "flushed session for " + target.getName()
                : target.getName() + ": no active session"));
    }

    private static Player targetOf(CommandSender sender, String[] args) {
        if (args.length < 2) {
            sender.sendMessage(Component.text("usage: /jevcraft " + args[0] + " <player>"));
            return null;
        }
        Player target = Bukkit.getPlayerExact(args[1]);
        if (target == null) {
            sender.sendMessage(Component.text("player not online: " + args[1]));
        }
        return target;
    }

    private static String describe(MiningSession s) {
        return s.sessionId() + " (" + s.startReason() + ", blocks=" + s.blocksBroken()
                + ", reveals=" + s.oreReveals() + ", oreBlocks=" + s.oreBlocksBroken() + ")";
    }

    @Override
    public List<String> onTabComplete(
            @NotNull CommandSender sender, @NotNull Command command, @NotNull String alias, String[] args) {
        if (args.length == 1) {
            return List.of("status", "session", "flush", "metrics");
        }
        if (args.length == 2 && (args[0].equalsIgnoreCase("session") || args[0].equalsIgnoreCase("flush"))) {
            return Bukkit.getOnlinePlayers().stream().map(Player::getName).toList();
        }
        return List.of();
    }
}
