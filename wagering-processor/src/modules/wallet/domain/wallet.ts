import { CurrencyMismatchError } from '../../../shared/domain/money/money.errors';
import { Money } from '../../../shared/domain/money/money';
import { LedgerDirection } from './ledger-direction';
import { WalletLedgerEntry } from './wallet-ledger-entry';
import { InsufficientBalanceError, InvalidMovementError, InvalidWalletError } from './wallet.errors';

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balance: Money;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OpenWalletProps {
  id: string;
  playerId: string;
  initialBalance: Money;
  now: Date;
}

export interface WalletMovement {
  entryId: string;
  transactionId: string;
  money: Money;
  at: Date;
}

export class Wallet {
  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    private _balance: Money,
    private _version: number,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static open(props: OpenWalletProps): Wallet {
    if (props.initialBalance.isNegative()) {
      throw new InvalidWalletError('Initial balance cannot be negative');
    }
    return new Wallet(
      props.id,
      props.playerId,
      props.initialBalance.currency,
      props.initialBalance,
      1,
      props.now,
      props.now,
    );
  }

  /** Reconstrução a partir da persistência: não revalida transições. */
  static rehydrate(state: WalletState): Wallet {
    return new Wallet(
      state.id,
      state.playerId,
      state.currency,
      state.balance,
      state.version,
      state.createdAt,
      state.updatedAt,
    );
  }

  get balance(): Money {
    return this._balance;
  }
  get version(): number {
    return this._version;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }

  /** Lançamento CREDIT da transação OPENING. Só vale enquanto a wallet não foi movimentada. */
  openingEntry(props: { entryId: string; transactionId: string }): WalletLedgerEntry | undefined {
    if (this._version !== 1) {
      throw new InvalidWalletError('Opening entry is only available before any movement');
    }
    if (this._balance.isZero()) return undefined;
    return WalletLedgerEntry.create({
      id: props.entryId,
      walletId: this.id,
      transactionId: props.transactionId,
      direction: LedgerDirection.Credit,
      money: this._balance,
      balanceBefore: Money.zero(this.currency),
      balanceAfter: this._balance,
      createdAt: this.createdAt,
    });
  }

  debit(movement: WalletMovement): WalletLedgerEntry {
    return this.apply(LedgerDirection.Debit, movement);
  }

  credit(movement: WalletMovement): WalletLedgerEntry {
    return this.apply(LedgerDirection.Credit, movement);
  }

  /** Cria o lançamento primeiro; só muda o estado se tudo for válido. */
  private apply(direction: LedgerDirection, m: WalletMovement): WalletLedgerEntry {
    this.assertSameCurrency(m.money);
    if (!m.money.isPositive()) {
      throw new InvalidMovementError('Movement amount must be greater than zero');
    }

    const before = this._balance;
    const after = direction === LedgerDirection.Debit ? before.subtract(m.money) : before.add(m.money);
    if (after.isNegative()) {
      throw new InsufficientBalanceError(before, m.money);
    }

    const entry = WalletLedgerEntry.create({
      id: m.entryId,
      walletId: this.id,
      transactionId: m.transactionId,
      direction,
      money: m.money,
      balanceBefore: before,
      balanceAfter: after,
      createdAt: m.at,
    });

    this._balance = after;
    this._version += 1;
    this._updatedAt = m.at;
    return entry;
  }

  private assertSameCurrency(money: Money): void {
    if (money.currency !== this.currency) {
      throw new CurrencyMismatchError(this.currency, money.currency);
    }
  }
}