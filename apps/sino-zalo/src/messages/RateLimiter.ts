export interface RateLimiterOptions {
  readonly intervalMs: number;
  /** Defaults to a monotonic clock: setting the wall clock back must not block sending for that long. */
  readonly now?: () => number;
}

/**
 * At most one event per interval for each key: a token bucket that holds a single token,
 * so there is never a burst (D-280).
 */
export class RateLimiter {
  /** When each key last took its turn. */
  private readonly last = new Map<string, number>();
  private readonly intervalMs: number;
  private readonly now: () => number;

  constructor(options: RateLimiterOptions) {
    this.intervalMs = options.intervalMs;
    this.now = options.now ?? (() => performance.now());
  }

  /** Takes the key's turn if a full interval has passed since its last one; a refused try takes nothing. */
  tryTake(key: string): boolean {
    const now = this.now();
    const last = this.last.get(key);
    if (last !== undefined && now - last < this.intervalMs) {
      return false;
    }
    this.last.set(key, now);
    return true;
  }
}
