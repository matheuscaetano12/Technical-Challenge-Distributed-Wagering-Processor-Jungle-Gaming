import type { TransactionContext } from '../../../../shared/application/unit-of-work.port';
import type { WagerTransaction } from '../wager-transaction';

export interface WagerTransactionRepository {
  /**
   * INSERT ... ON CONFLICT DO NOTHING. Devolve true se inseriu, false se já existia
   * (por idempotency key ou por transação externa do provedor).
   */
  insertIfAbsent(tx: TransactionContext, transaction: WagerTransaction): Promise<boolean>;

  findById(tx: TransactionContext, id: string): Promise<WagerTransaction | undefined>;
  findByIdempotencyKey(tx: TransactionContext, providerId: string, key: string): Promise<WagerTransaction | undefined>;
  findByExternalId(tx: TransactionContext, providerId: string, externalId: string): Promise<WagerTransaction | undefined>;

  /** Persiste uma transição de estado. Só atua em transações ainda não terminais. */
  update(tx: TransactionContext, transaction: WagerTransaction): Promise<void>;

  /** Já existe REFUND/ROLLBACK PROCESSED revertendo esta transação? */
  existsProcessedReversalOf(tx: TransactionContext, referenceTransactionId: string): Promise<boolean>;
}