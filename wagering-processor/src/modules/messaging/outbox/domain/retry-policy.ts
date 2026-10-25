export interface RetryPolicy {
  /** Espera, em ms, antes da tentativa seguinte. `attempt` é o número de falhas até agora (>= 1). */
  delayMs(attempt: number): number;
}

/** Backoff exponencial: base * 2^(attempt-1), limitado a um teto. Sem jitter, para ser determinístico. */
export class ExponentialBackoff implements RetryPolicy {
  constructor(
    private readonly baseMs = 1_000,
    private readonly maxMs = 300_000,
  ) {}

  delayMs(attempt: number): number {
    const exponent = Math.max(0, attempt - 1);
    return Math.min(this.maxMs, this.baseMs * 2 ** exponent);
  }
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = new ExponentialBackoff();