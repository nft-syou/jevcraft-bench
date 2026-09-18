package dev.jevcraft.plugin.telemetry;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Maps real player UUIDs to {@code hmac-sha256:<hex>} identifiers. The raw UUID never
 * leaves this class. With no configured secret a random per-run secret is used, so ids are
 * still pseudonymous but not stable across restarts ({@link #isEphemeral()}).
 */
public final class PlayerPseudonymizer {
    public static final String PREFIX = "hmac-sha256:";
    private static final String ALGORITHM = "HmacSHA256";

    private final SecretKeySpec key;
    private final boolean ephemeral;

    private PlayerPseudonymizer(byte[] secret, boolean ephemeral) {
        this.key = new SecretKeySpec(secret, ALGORITHM);
        this.ephemeral = ephemeral;
    }

    public static PlayerPseudonymizer fromSecret(String secret) {
        if (secret == null || secret.isBlank()) {
            throw new IllegalArgumentException("secret must not be blank");
        }
        return new PlayerPseudonymizer(secret.getBytes(StandardCharsets.UTF_8), false);
    }

    public static PlayerPseudonymizer randomForThisRun() {
        byte[] secret = new byte[32];
        new SecureRandom().nextBytes(secret);
        return new PlayerPseudonymizer(secret, true);
    }

    public boolean isEphemeral() {
        return ephemeral;
    }

    public String pseudonymize(UUID playerId) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(key);
            byte[] digest = mac.doFinal(playerId.toString().getBytes(StandardCharsets.UTF_8));
            return PREFIX + HexFormat.of().formatHex(digest);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HMAC unavailable", e);
        }
    }
}
