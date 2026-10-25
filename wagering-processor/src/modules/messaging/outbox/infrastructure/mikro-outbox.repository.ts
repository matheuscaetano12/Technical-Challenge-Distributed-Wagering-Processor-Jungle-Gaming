import type { TransactionContext } from '../../../../shared/application/unit-of-work.port';
import { emOf } from '../../../../shared/infrastructure/persistence/mikro-unit-of-work';
import { toDate } from '../../../../shared/infrastructure/persistence/pg-timestamp';
import { OutboxMessage } from '../domain/outbox-message';
import type { OutboxRepository } from '../domain/outbox.repository';

interface OutboxRow {
  id: string;
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>; // jsonb já chega como objeto
  occurred_at: Date | string;
  attempts: number;
  next_attempt_at: Date | string | null;
  published_at: Date | string | null;
}

const COLUMNS = 'id, aggregate_id, event_type, payload, occurred_at, attempts, next_attempt_at, published_at';

function fromRow(row: OutboxRow): OutboxMessage {
  return OutboxMessage.rehydrate({
    id: row.id,
    aggregateId: row.aggregate_id,
    eventType: row.event_type,
    payload: row.payload,
    occurredAt: toDate(row.occurred_at),
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at === null ? undefined : toDate(row.next_attempt_at),
    publishedAt: row.published_at === null ? undefined : toDate(row.published_at),
  });
}

export class MikroOutboxRepository implements OutboxRepository {
  async insert(tx: TransactionContext, m: OutboxMessage): Promise<void> {
    await emOf(tx).execute(
      `insert into outbox_messages (id, aggregate_id, event_type, payload, occurred_at, attempts, next_attempt_at, published_at)
       values (?, ?, ?, cast(? as jsonb), ?, ?, ?, ?)`,
      [
        m.id,
        m.aggregateId,
        m.eventType,
        JSON.stringify(m.payload),
        m.occurredAt,
        m.attempts,
        m.nextAttemptAt ?? null,
        m.publishedAt ?? null,
      ],
      'run',
    );
  }

  async claimDue(tx: TransactionContext, now: Date, limit: number): Promise<OutboxMessage[]> {
    const rows = await emOf(tx).execute<OutboxRow[]>(
      `select ${COLUMNS} from outbox_messages
        where published_at is null and (next_attempt_at is null or next_attempt_at <= ?)
        order by occurred_at, id
        limit ?
        for update skip locked`,
      [now, limit],
    );
    return rows.map(fromRow);
  }

  async markPublished(tx: TransactionContext, m: OutboxMessage): Promise<void> {
    await emOf(tx).execute(
      `update outbox_messages set published_at = ?, next_attempt_at = null where id = ? and published_at is null`,
      [m.publishedAt ?? null, m.id],
      'run',
    );
  }

  async saveRetry(tx: TransactionContext, m: OutboxMessage): Promise<void> {
    await emOf(tx).execute(
      `update outbox_messages set attempts = ?, next_attempt_at = ? where id = ? and published_at is null`,
      [m.attempts, m.nextAttemptAt ?? null, m.id],
      'run',
    );
  }
}