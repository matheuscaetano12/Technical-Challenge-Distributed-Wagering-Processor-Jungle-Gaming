import type { TransactionContext } from '../../../../shared/application/unit-of-work.port';
import type { Wallet } from '../wallet';

export interface WalletRepository {
  insert(tx: TransactionContext, wallet: Wallet): Promise<void>;
  findById(tx: TransactionContext, id: string): Promise<Wallet | undefined>;
  /** SELECT ... FOR UPDATE: trava só esta wallet até o fim da transação. */
  findByIdForUpdate(tx: TransactionContext, id: string): Promise<Wallet | undefined>;
  /** UPDATE ... WHERE version = expectedVersion. Lança ConcurrentWalletModificationError se não atualizar 1 linha. */
  updateBalance(tx: TransactionContext, wallet: Wallet, expectedVersion: number): Promise<void>;
}