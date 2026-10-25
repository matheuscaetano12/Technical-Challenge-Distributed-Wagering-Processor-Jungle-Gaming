import type { TransactionContext } from '../../../../shared/application/unit-of-work.port';
import type { InboxMessage } from './inbox-message';

export interface InboxRepository {
  /** INSERT ... ON CONFLICT DO NOTHING por (consumerName, messageId). true = primeira vez. */
  insertIfAbsent(tx: TransactionContext, message: InboxMessage): Promise<boolean>;
  find(tx: TransactionContext, consumerName: string, messageId: string): Promise<InboxMessage | undefined>;
  markProcessed(tx: TransactionContext, message: InboxMessage): Promise<void>;
}