package dev.jevcraft.plugin.telemetry;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class PlayerPseudonymizerTest {
    private static final UUID PLAYER = UUID.fromString("123e4567-e89b-12d3-a456-426614174000");

    @Test
    void sameSecretGivesStableIdAcrossInstances() {
        String a = PlayerPseudonymizer.fromSecret("s3cret").pseudonymize(PLAYER);
        String b = PlayerPseudonymizer.fromSecret("s3cret").pseudonymize(PLAYER);
        assertEquals(a, b);
    }

    @Test
    void differentSecretsGiveDifferentIds() {
        String a = PlayerPseudonymizer.fromSecret("one").pseudonymize(PLAYER);
        String b = PlayerPseudonymizer.fromSecret("two").pseudonymize(PLAYER);
        assertNotEquals(a, b);
    }

    @Test
    void idHasPrefixAndNeverContainsTheUuid() {
        String id = PlayerPseudonymizer.fromSecret("s3cret").pseudonymize(PLAYER);
        assertTrue(id.startsWith("hmac-sha256:"));
        assertEquals("hmac-sha256:".length() + 64, id.length());
        assertFalse(id.contains(PLAYER.toString()));
        assertFalse(id.contains("123e4567"));
    }

    @Test
    void randomSecretIsEphemeralAndStillPseudonymous() {
        PlayerPseudonymizer p = PlayerPseudonymizer.randomForThisRun();
        assertTrue(p.isEphemeral());
        assertEquals(p.pseudonymize(PLAYER), p.pseudonymize(PLAYER));
        assertNotEquals(p.pseudonymize(PLAYER), PlayerPseudonymizer.randomForThisRun().pseudonymize(PLAYER));
    }

    @Test
    void blankSecretIsRejected() {
        assertThrows(IllegalArgumentException.class, () -> PlayerPseudonymizer.fromSecret("  "));
    }
}
