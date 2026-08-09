import type { RunnerApiClient, LogEntry } from "../api-client";
import {
  LOG_BATCH_INTERVAL_MS,
  LOG_BATCH_MAX_LINES,
} from "@deployx/shared";

export interface LogStreamerOptions {
  readonly client: RunnerApiClient;
  readonly runId: string;
  readonly flushIntervalMs?: number;
  readonly maxBatchSize?: number;
}

/**
 * Buffers log entries and flushes them to the control plane in batches.
 *
 * Flushes when:
 * - Buffer reaches maxBatchSize (default: 50 lines)
 * - Timer fires (default: every 500ms)
 * - shutdown() is called
 *
 * API errors are logged to stderr but never crash the pipeline.
 */
export class LogStreamer {
  private readonly client: RunnerApiClient;
  private readonly runId: string;
  private readonly maxBatchSize: number;
  private buffer: LogEntry[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;

  constructor(options: LogStreamerOptions) {
    this.client = options.client;
    this.runId = options.runId;
    this.maxBatchSize = options.maxBatchSize ?? LOG_BATCH_MAX_LINES;

    const interval = options.flushIntervalMs ?? LOG_BATCH_INTERVAL_MS;
    this.timer = setInterval(() => {
      void this.flush();
    }, interval);
  }

  /**
   * Push a log entry into the buffer. Auto-flushes if batch is full.
   */
  push(entry: Omit<LogEntry, "timestamp"> & { timestamp?: string }): void {
    const fullEntry: LogEntry = {
      ...entry,
      timestamp: entry.timestamp ?? new Date().toISOString(),
    };
    this.buffer.push(fullEntry);

    if (this.buffer.length >= this.maxBatchSize) {
      void this.flush();
    }
  }

  /**
   * Flush all buffered entries to the API. Safe to call concurrently
   * (subsequent calls wait for the current flush to finish).
   */
  async flush(): Promise<void> {
    if (this.isFlushing || this.buffer.length === 0) return;

    this.isFlushing = true;
    const batch = [...this.buffer];
    this.buffer = [];

    try {
      await this.client.sendLogs(this.runId, batch);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Log flush failed (${batch.length} entries): ${msg}`);
      // Fire-and-forget — do NOT re-queue to avoid infinite loops
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Stop the timer and flush remaining entries.
   */
  async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }
}
