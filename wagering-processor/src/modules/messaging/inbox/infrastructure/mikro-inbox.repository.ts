import type { QueryResult } from '@mikro-orm/core';
import type { TransactionContext } from '../../../../shared/application/unit-of-work.port';
import { emOf } from '../../../../shared/infrastructure/persistence/mikro-unit-of-work';
import { toDate } from '../../../../shared/infrastructure/persistence/pg-timestamp';
import { InboxMessage } from '../domain/inbox-message';
import type { InboxRepository } from '../domain/inbox.repository';

interface InboxRow {
  consumer_name: string;
  message_id: string;
  payload_hash: string;
  received_at: Date | string;
  processed_at: Date | string | null;
}

export class MikroInboxRepository implements InboxRepository {
  async insertIfAbsent(tx: TransactionContext, m: InboxMessage): Promise<boolean> {
    // Sob concorrência, a 2ª transação espera a 1ª terminar e então não insere nada.
    const result = await emOf(tx).execute<QueryResult>(
      `insert into inbox_messages (consumer_name, message_id, payload_hash, received_at, processed_at)
       values (?, ?, ?, ?, ?)
       on conflict (consumer_name, message_id) do nothing`,
      [m.consumerName, m.messageId, m.payloadHash, m.receivedAt, m.processedAt ?? null],
      'run',
    );
    return result.affectedRows === 1;
  }

  async find(tx: TransactionContext, consumerName: string, messageId: string): Promise<InboxMessage | undefined> {
    const rows = await emOf(tx).execute<InboxRow[]>(
      `select consumer_name, message_id, payload_hash, received_at, processed_at
         from inbox_messages where consumer_name = ? and message_id = ?`,
      [consumerName, messageId],
    );
    const row = rows[0];
    if (!row) return undefined;
    return InboxMessage.rehydrate({
      consumerName: row.consumer_name,
      messageId: row.message_id,
      payloadHash: row.payload_hash,
      receivedAt: toDate(row.received_at),
      processedAt: row.processed_at === null ? undefined : toDate(row.processed_at),
    });
  }

  async markProcessed(tx: TransactionContext, m: InboxMessage): Promise<void> {
    await emOf(tx).execute(
      `update inbox_messages set processed_at = ?
        where consumer_name = ? and message_id = ? and processed_at is null`,
      [m.processedAt ?? null, m.consumerName, m.messageId],
      'run',
    );
  }
}