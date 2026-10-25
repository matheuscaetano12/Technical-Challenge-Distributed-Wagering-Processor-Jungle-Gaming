import { DomainError } from '../../../../shared/domain/domain-error';
import type { IntegrationEvent } from '../../../../shared/domain/integration-event';
import { DEFAULT_RETRY_POLICY, type RetryPolicy } from './retry-policy';

export class InvalidOutboxStateError extends DomainError {
  readonly code = 'INVALID_OUTBOX_STATE';
  constructor(message: string) {
    super(message);
  }
}

export interface OutboxMessageState {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Readonly<Record<string, unknown>>;
  occurredAt: Date;
  attempts: number;
  nextAttemptAt?: Date;
  publishedAt?: Date;
}

export class OutboxMessage {
  private constructor(
    public readonly id: string,
    public readonly aggregateId: string,
    public readonly eventType: string,
    public readonly payload: Readonly<Record<string, unknown>>,
    public readonly occurredAt: Date,
    private _attempts: number,
    private _nextAttemptAt?: Date,
    private _publishedAt?: Date,
  ) {}

  /** O id da outbox é o eventId: uma publicação duplicada carrega o mesmo id e o consumidor deduplica. */
  static enqueue(event: IntegrationEvent<unknown>): OutboxMessage {
    return new OutboxMessage(
      event.eventId,
      event.aggregateId,
      event.eventType,
      event.toJSON() as unknown as Record<string, unknown>,
      event.occurredAt,
      0,
    );
  }

  static rehydrate(s: OutboxMessageState): OutboxMessage {
    return new OutboxMessage(
      s.id,
      s.aggregateId,
      s.eventType,
      s.payload,
      s.occurredAt,
      s.attempts,
      s.nextAttemptAt,
      s.publishedAt,
    );
  }

  get attempts(): number {
    return this._attempts;
  }
  get nextAttemptAt(): Date | undefined {
    return this._nextAttemptAt;
  }
  get publishedAt(): Date | undefined {
    return this._publishedAt;
  }

  isPending(): boolean {
    return this._publishedAt === undefined;
  }

  isDue(now: Date): boolean {
    return this.isPending() && (this._nextAttemptAt === undefined || this._nextAttemptAt.getTime() <= now.getTime());
  }

  markPublished(at: Date): void {
    if (!this.isPending()) throw new InvalidOutboxStateError(`Outbox message ${this.id} is already published`);
    this._publishedAt = at;
    this._nextAttemptAt = undefined;
  }

  /** Incrementa attempts e calcula o próximo nextAttemptAt (backoff exponencial). */
  scheduleRetry(now: Date, policy: RetryPolicy = DEFAULT_RETRY_POLICY): void {
    if (!this.isPending()) throw new InvalidOutboxStateError(`Outbox message ${this.id} is already published`);
    this._attempts += 1;
    this._nextAttemptAt = new Date(now.getTime() + policy.delayMs(this._attempts));
  }
}