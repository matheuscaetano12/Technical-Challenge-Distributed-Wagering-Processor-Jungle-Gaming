import { describe, expect, test } from 'bun:test';
import { Money } from '../../../src/shared/domain/money/money';
import { CurrencyMismatchError } from '../../../src/shared/domain/money/money.errors';
import { LedgerDirection } from '../../../src/modules/wallet/domain/ledger-direction';
import { WalletLedgerEntry } from '../../../src/modules/wallet/domain/wallet-ledger-entry';
import { LedgerEntryUnbalancedError } from '../../../src/modules/wallet/domain/wallet.errors';

const brl = (amount: string) => Money.from({ amount, currency: 'BRL' });
const base = {
  id: 'e1',
  walletId: 'w1',
  transactionId: 't1',
  createdAt: new Date('2026-10-24T12:00:00Z'),
};

describe('WalletLedgerEntry', () => {
  test('cria lançamento DEBIT balanceado', () => {
    const e = WalletLedgerEntry.create({
      ...base,
      direction: LedgerDirection.Debit,
      money: brl('25.00'),
      balanceBefore: brl('100.00'),
      balanceAfter: brl('75.00'),
    });
    expect(e.isBalanced()).toBe(true);
  });

  test('rejeita aritmética inconsistente', () => {
    expect(() =>
      WalletLedgerEntry.create({
        ...base,
        direction: LedgerDirection.Credit,
        money: brl('25.00'),
        balanceBefore: brl('100.00'),
        balanceAfter: brl('120.00'),
      }),
    ).toThrow(LedgerEntryUnbalancedError);
  });

  test('rejeita valor zero e saldos negativos', () => {
    expect(() =>
      WalletLedgerEntry.create({
        ...base,
        direction: LedgerDirection.Credit,
        money: brl('0.00'),
        balanceBefore: brl('1.00'),
        balanceAfter: brl('1.00'),
      }),
    ).toThrow(LedgerEntryUnbalancedError);

    expect(() =>
      WalletLedgerEntry.create({
        ...base,
        direction: LedgerDirection.Debit,
        money: brl('10.00'),
        balanceBefore: brl('5.00'),
        balanceAfter: brl('5.00').subtract(brl('10.00')),
      }),
    ).toThrow(LedgerEntryUnbalancedError);
  });

  test('rejeita moedas diferentes', () => {
    expect(() =>
      WalletLedgerEntry.create({
        ...base,
        direction: LedgerDirection.Credit,
        money: brl('1.00'),
        balanceBefore: Money.from({ amount: '1.00', currency: 'USD' }),
        balanceAfter: brl('2.00'),
      }),
    ).toThrow(CurrencyMismatchError);
  });
});