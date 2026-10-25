import type { TransactionContext } from '../../../../shared/application/unit-of-work.port';
import type { OutboxMessage } from './outbox-message';

export interface OutboxRepository {
  insert(tx: TransactionContext, message: OutboxMessage): Promise<void>;
  /**
   * Reserva até `limit` mensagens vencidas, travando as linhas (FOR UPDATE SKIP LOCKED).
   * Vários publishers concorrentes recebem lotes disjuntos, sem esperar uns pelos outros.
   */
  claimDue(tx: TransactionContext, now: Date, limit: number): Promise<OutboxMessage[]>;
  markPublished(tx: TransactionContext, message: OutboxMessage): Promise<void>;
  /** Persiste attempts e nextAttemptAt depois de scheduleRetry. */
  saveRetry(tx: TransactionContext, message: OutboxMessage): Promise<void>;
}