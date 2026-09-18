package dev.jevcraft.plugin.telemetry;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class JsonlWriterTest {

    /** Sink that blocks every write until released, to fill the queue deterministically. */
    private static final class GatedSink implements JsonlWriter.Sink {
        final List<String> lines = Collections.synchronizedList(new ArrayList<>());
        final CountDownLatch gate = new CountDownLatch(1);

        @Override
        public void write(String line) throws IOException {
            try {
                gate.await(10, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IOException(e);
            }
            lines.add(line);
        }

        @Override
        public void flush() {}

        @Override
        public void close() {}
    }

    @Test
    void writesLinesInOrderToAFile(@TempDir Path dir) throws Exception {
        Path file = dir.resolve("nested/run.jsonl");
        try (JsonlWriter writer = new JsonlWriter(JsonlWriter.fileSink(file), 100, t -> {})) {
            assertTrue(writer.offer("{\"n\":1}"));
            assertTrue(writer.offer("{\"n\":2}"));
            assertTrue(writer.flush(5, TimeUnit.SECONDS));
            assertEquals(2, writer.writtenCount());
        }
        assertEquals(List.of("{\"n\":1}", "{\"n\":2}"), Files.readAllLines(file));
    }

    @Test
    void dropsAndCountsWhenTheQueueIsFullWithoutBlocking() throws Exception {
        GatedSink sink = new GatedSink();
        JsonlWriter writer = new JsonlWriter(sink, 2, t -> {});
        // The drain thread takes one line and blocks in write(); two more fit in the queue.
        assertTrue(writer.offer("a"));
        Thread.sleep(100);
        assertTrue(writer.offer("b"));
        assertTrue(writer.offer("c"));
        long start = System.nanoTime();
        assertFalse(writer.offer("d"));
        assertFalse(writer.offer("e"));
        assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start) < 100, "offer must not block");
        assertEquals(2, writer.droppedCount());

        sink.gate.countDown();
        assertTrue(writer.flush(5, TimeUnit.SECONDS));
        assertEquals(List.of("a", "b", "c"), sink.lines);
        writer.close();
    }

    @Test
    void closeDrainsWhatIsQueuedAndRejectsLaterOffers(@TempDir Path dir) throws Exception {
        Path file = dir.resolve("run.jsonl");
        JsonlWriter writer = new JsonlWriter(JsonlWriter.fileSink(file), 100, t -> {});
        for (int i = 0; i < 50; i++) {
            writer.offer("{\"i\":" + i + "}");
        }
        writer.close();
        assertEquals(50, Files.readAllLines(file).size());
        assertFalse(writer.offer("late"));
        assertEquals(1, writer.droppedCount());
    }
}
