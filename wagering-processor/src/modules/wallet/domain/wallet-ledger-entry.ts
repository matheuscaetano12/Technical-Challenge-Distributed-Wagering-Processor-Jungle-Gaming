import { CurrencyMismatchError } from '../../../shared/domain/money/money.errors';
import type { Money } from '../../../shared/domain/money/money';
import { LedgerDirection } from './ledger-direction';
import { LedgerEntryUnbalancedError } from './wallet.errors';

export interface LedgerEntryState {
  id: string;
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: Money;
  balanceBefore: Money;
  balanceAfter: Money;
  createdAt: Date;
}

export type CreateLedgerEntryProps = LedgerEntryState;

/** Imutável: só campos readonly e nenhum método de transição. */
export class WalletLedgerEntry {
  private constructor(
    public readonly id: string,
    public readonly walletId: string,
    public readonly transactionId: string,
    public readonly direction: LedgerDirection,
    public readonly money: Money,
    public readonly balanceBefore: Money,
    public readonly balanceAfter: Money,
    public readonly createdAt: Date,
  ) {}

  /** Valida moeda, sinais e aritmética do lançamento. */
  static create(props: CreateLedgerEntryProps): WalletLedgerEntry {
    const { money, balanceBefore, balanceAfter } = props;

    for (const other of [balanceBefore, balanceAfter]) {
      if (other.currency !== money.currency) {
        throw new CurrencyMismatchError(money.currency, other.currency);
      }
    }
    if (!money.isPositive()) {
      throw new LedgerEntryUnbalancedError('Ledger entry amount must be positive');
    }
    if (balanceBefore.isNegative() || balanceAfter.isNegative()) {
      throw new LedgerEntryUnbalancedError('Ledger balances cannot be negative');
    }

    const entry = WalletLedgerEntry.build(props);
    if (!entry.isBalanced()) {
      throw new LedgerEntryUnbalancedError(
        `${props.direction} ${money.toString()}: ${balanceBefore.toString()} -> ${balanceAfter.toString()} does not add up`,
      );
    }
    return entry;
  }

  /** Reconstrução a partir da persistência: não revalida. */
  static rehydrate(state: LedgerEntryState): WalletLedgerEntry {
    return WalletLedgerEntry.build(state);
  }

  /** balanceBefore ± money === balanceAfter. */
  isBalanced(): boolean {
    const expected =
      this.direction === LedgerDirection.Debit
        ? this.balanceBefore.subtract(this.money)
        : this.balanceBefore.add(this.money);
    return expected.equals(this.balanceAfter);
  }

  private static build(s: LedgerEntryState): WalletLedgerEntry {
    return new WalletLedgerEntry(
      s.id,
      s.walletId,
      s.transactionId,
      s.direction,
      s.money,
      s.balanceBefore,
      s.balanceAfter,
      s.createdAt,
    );
  }
}