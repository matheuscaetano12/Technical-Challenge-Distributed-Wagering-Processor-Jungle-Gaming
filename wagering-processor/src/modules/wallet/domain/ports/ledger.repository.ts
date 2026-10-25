import type { TransactionContext } from '../../../../shared/application/unit-of-work.port';
import type { Money } from '../../../../shared/domain/money/money';
import type { WalletLedgerEntry } from '../wallet-ledger-entry';

export interface LedgerTotals {
  credits: Money;
  debits: Money;
  entries: number;
}

export interface LedgerRepository {
  insert(tx: TransactionContext, entry: WalletLedgerEntry): Promise<void>;
  /** Soma de créditos e débitos do ledger (base da reconciliação). */
  totalsForWallet(tx: TransactionContext, walletId: string, currency: string): Promise<LedgerTotals>;
}