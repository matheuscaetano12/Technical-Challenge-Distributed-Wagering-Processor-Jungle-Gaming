import type { TransactionContext } from '../../../../shared/application/unit-of-work.port';
import { Money } from '../../../../shared/domain/money/money';
import { emOf } from '../../../../shared/infrastructure/persistence/mikro-unit-of-work';
import type { LedgerRepository, LedgerTotals } from '../../domain/ports/ledger.repository';
import type { WalletLedgerEntry } from '../../domain/wallet-ledger-entry';

interface TotalsRow {
  credits: string;
  debits: string;
  entries: string; // count(*) chega como string (bigint)
}

export class MikroLedgerRepository implements LedgerRepository {
  async insert(tx: TransactionContext, e: WalletLedgerEntry): Promise<void> {
    await emOf(tx).execute(
      `insert into wallet_ledger_entries
         (id, wallet_id, transaction_id, direction, amount, balance_before, balance_after, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        e.id,
        e.walletId,
        e.transactionId,
        e.direction,
        e.money.amount,
        e.balanceBefore.amount,
        e.balanceAfter.amount,
        e.createdAt,
      ],
      'run',
    );
  }

  async totalsForWallet(tx: TransactionContext, walletId: string, currency: string): Promise<LedgerTotals> {
    const rows = await emOf(tx).execute<TotalsRow[]>(
      `select coalesce(sum(amount) filter (where direction = 'CREDIT'), 0) as credits,
              coalesce(sum(amount) filter (where direction = 'DEBIT'), 0)  as debits,
              count(*) as entries
         from wallet_ledger_entries
        where wallet_id = ?`,
      [walletId],
    );
    const row = rows[0]!;
    return {
      credits: Money.from({ amount: row.credits, currency }),
      debits: Money.from({ amount: row.debits, currency }),
      entries: Number(row.entries),
    };
  }
}