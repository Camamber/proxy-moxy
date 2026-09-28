export type CaptureOutcome = { complete: true } | { complete: false; reason: unknown };

/**
 * Pass-through web stream that keeps the first `limit` bytes and counts everything.
 * `done` settles when the stream drains (`complete`) or is cancelled or aborted,
 * for example because the client went away mid-response.
 */
export class BodyCapture {
  readonly limit: number;
  readonly stream: TransformStream<Uint8Array, Uint8Array>;
  readonly done: Promise<CaptureOutcome>;
  /** Total bytes seen so far. */
  size = 0;
  #kept: Uint8Array[] = [];
  #keptBytes = 0;

  constructor(limit: number) {
    this.limit = limit;
    const { promise, resolve } = Promise.withResolvers<CaptureOutcome>();
    this.done = promise;
    this.stream = new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk, controller) => {
        this.#record(chunk);
        controller.enqueue(chunk);
      },
      flush: () => resolve({ complete: true }),
      cancel: (reason) => resolve({ complete: false, reason }),
    });
  }

  get truncated(): boolean {
    return this.size > this.limit;
  }

  bytes(): Buffer {
    return Buffer.concat(this.#kept);
  }

  #record(chunk: Uint8Array): void {
    this.size += chunk.byteLength;
    const room = this.limit - this.#keptBytes;
    if (room <= 0) return;
    const part = chunk.byteLength > room ? chunk.subarray(0, room) : chunk;
    this.#kept.push(part);
    this.#keptBytes += part.byteLength;
  }
}
