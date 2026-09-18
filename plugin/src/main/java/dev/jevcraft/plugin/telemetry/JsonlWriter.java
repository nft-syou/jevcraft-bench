package dev.jevcraft.plugin.telemetry;

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;

/**
 * Bounded, non-blocking JSONL writer. {@link #offer(String)} returns immediately; a daemon
 * thread drains the queue to the sink. When the queue is full the line is dropped and counted
 * so the game tick is never delayed by disk I/O (spec §7 thread policy).
 */
public final class JsonlWriter implements AutoCloseable {

    /** Where lines go. Kept as an interface so tests can use a slow or in-memory sink. */
    public interface Sink extends AutoCloseable {
        void write(String line) throws IOException;

        void flush() throws IOException;

        @Override
        void close() throws IOException;
    }

    public static Sink fileSink(Path file) throws IOException {
        Files.createDirectories(file.toAbsolutePath().getParent());
        BufferedWriter out = Files.newBufferedWriter(
                file, StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        return new Sink() {
            @Override
            public void write(String line) throws IOException {
                out.write(line);
                out.write('\n');
            }

            @Override
            public void flush() throws IOException {
                out.flush();
            }

            @Override
            public void close() throws IOException {
                out.close();
            }
        };
    }

    private static final String FLUSH_MARKER = "\u0000flush";

    private final BlockingQueue<String> queue;
    private final Sink sink;
    private final Consumer<Throwable> onError;
    private final Thread thread;
    private final AtomicBoolean running = new AtomicBoolean(true);
    private final AtomicLong written = new AtomicLong();
    private final AtomicLong dropped = new AtomicLong();
    private final List<CountDownLatch> flushLatches = new ArrayList<>();

    public JsonlWriter(Sink sink, int capacity, Consumer<Throwable> onError) {
        this.sink = sink;
        this.queue = new ArrayBlockingQueue<>(capacity);
        this.onError = onError;
        this.thread = new Thread(this::drainLoop, "jevcraft-jsonl-writer");
        this.thread.setDaemon(true);
        this.thread.start();
    }

    /** Never blocks. Returns false (and counts a drop) when the queue is full or the writer is closed. */
    public boolean offer(String line) {
        if (!running.get() || !queue.offer(line)) {
            dropped.incrementAndGet();
            return false;
        }
        return true;
    }

    public long writtenCount() {
        return written.get();
    }

    public long droppedCount() {
        return dropped.get();
    }

    public int queueSize() {
        return queue.size();
    }

    /** Waits until everything queued before this call has reached the sink, or the timeout elapses. */
    public boolean flush(long timeout, TimeUnit unit) throws InterruptedException {
        CountDownLatch latch = new CountDownLatch(1);
        synchronized (flushLatches) {
            flushLatches.add(latch);
        }
        // The marker itself must not be dropped, so wait (bounded) for space.
        if (!queue.offer(FLUSH_MARKER, timeout, unit)) {
            return false;
        }
        return latch.await(timeout, unit);
    }

    @Override
    public void close() {
        if (!running.compareAndSet(true, false)) {
            return;
        }
        thread.interrupt();
        try {
            thread.join(TimeUnit.SECONDS.toMillis(5));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        drainRemaining();
        try {
            sink.flush();
            sink.close();
        } catch (IOException e) {
            onError.accept(e);
        }
    }

    private void drainLoop() {
        while (running.get()) {
            try {
                String line = queue.poll(250, TimeUnit.MILLISECONDS);
                if (line == null) {
                    sink.flush();
                    continue;
                }
                handle(line);
                if (queue.isEmpty()) {
                    sink.flush();
                }
            } catch (InterruptedException e) {
                return;
            } catch (IOException e) {
                onError.accept(e);
            }
        }
    }

    private void drainRemaining() {
        String line;
        while ((line = queue.poll()) != null) {
            try {
                handle(line);
            } catch (IOException e) {
                onError.accept(e);
            }
        }
    }

    private void handle(String line) throws IOException {
        if (FLUSH_MARKER.equals(line)) {
            sink.flush();
            CountDownLatch latch;
            synchronized (flushLatches) {
                latch = flushLatches.isEmpty() ? null : flushLatches.remove(0);
            }
            if (latch != null) {
                latch.countDown();
            }
            return;
        }
        sink.write(line);
        written.incrementAndGet();
    }
}
