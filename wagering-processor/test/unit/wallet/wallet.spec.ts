import { describe, expect, test } from 'bun:test';
import { Money } from '../../../src/shared/domain/money/money';
import { CurrencyMismatchError } from '../../../src/shared/domain/money/money.errors';
import { LedgerDirection } from '../../../src/modules/wallet/domain/ledger-direction';
import { Wallet } from '../../../src/modules/wallet/domain/wallet';
import { InsufficientBalanceError, InvalidMovementError } from '../../../src/modules/wallet/domain/wallet.errors';

const brl = (amount: string) => Money.from({ amount, currency: 'BRL' });
const now = new Date('2026-10-24T12:00:00Z');

const openWallet = (initial = '100.00') =>
  Wallet.open({ id: 'w1', playerId: 'p1', initialBalance: brl(initial), now });

const move = (n: number, amount: string) => ({
  entryId: `e${n}`,
  transactionId: `t${n}`,
  money: brl(amount),
  at: now,
});

describe('Wallet', () => {
  test('abre com version 1 e saldo inicial', () => {
    const w = openWallet('100.00');
    expect(w.version).toBe(1);
    expect(w.balance.amount).toBe('100.00');
    expect(w.currency).toBe('BRL');
  });

  test('debit reduz saldo, incrementa version e devolve lançamento coerente', () => {
    const w = openWallet();
    const entry = w.debit(move(1, '80.00'));
    expect(w.balance.amount).toBe('20.00');
    expect(w.version).toBe(2);
    expect(entry.direction).toBe(LedgerDirection.Debit);
    expect(entry.balanceBefore.amount).toBe('100.00');
    expect(entry.balanceAfter.amount).toBe('20.00');
    expect(entry.isBalanced()).toBe(true);
  });

  test('credit aumenta saldo', () => {
    const w = openWallet('10.00');
    const entry = w.credit(move(1, '5.50'));
    expect(w.balance.amount).toBe('15.50');
    expect(entry.direction).toBe(LedgerDirection.Credit);
  });

  test('cenário da seção 8: 100.00 e duas apostas de 80.00 -> só uma passa', () => {
    const w = openWallet('100.00');
    w.debit(move(1, '80.00'));
    expect(() => w.debit(move(2, '80.00'))).toThrow(InsufficientBalanceError);
    expect(w.balance.amount).toBe('20.00');
  });

  test('permite debitar exatamente o saldo (fica zerado)', () => {
    const w = openWallet('50.00');
    w.debit(move(1, '50.00'));
    expect(w.balance.isZero()).toBe(true);
  });

  test('falha não altera saldo nem version', () => {
    const w = openWallet('10.00');
    expect(() => w.debit(move(1, '10.01'))).toThrow(InsufficientBalanceError);
    expect(w.balance.amount).toBe('10.00');
    expect(w.version).toBe(1);
  });

  test('rejeita movimento zero', () => {
    const w = openWallet();
    expect(() => w.credit(move(1, '0.00'))).toThrow(InvalidMovementError);
    expect(w.version).toBe(1);
  });

  test('conflito de moeda', () => {
    const w = openWallet();
    const usd = { ...move(1, '1.00'), money: Money.from({ amount: '1.00', currency: 'USD' }) };
    expect(() => w.debit(usd)).toThrow(CurrencyMismatchError);
    expect(() => w.credit(usd)).toThrow(CurrencyMismatchError);
  });

  test('openingEntry gera CREDIT do zero ao saldo inicial; sem saldo, não gera', () => {
    const entry = openWallet('1000.00').openingEntry({ entryId: 'e0', transactionId: 't0' });
    expect(entry?.direction).toBe(LedgerDirection.Credit);
    expect(entry?.balanceBefore.amount).toBe('0.00');
    expect(entry?.balanceAfter.amount).toBe('1000.00');
    expect(openWallet('0.00').openingEntry({ entryId: 'e0', transactionId: 't0' })).toBeUndefined();
  });

  test('openingEntry não vale depois de movimentar', () => {
    const w = openWallet();
    w.debit(move(1, '1.00'));
    expect(() => w.openingEntry({ entryId: 'e0', transactionId: 't0' })).toThrow();
  });

  test('invariante: saldo == saldo reconstruído pelo ledger', () => {
    const w = openWallet('0.00');
    const entries = [
      w.credit(move(1, '100.00')),
      w.debit(move(2, '30.25')),
      w.credit(move(3, '5.00')),
      w.debit(move(4, '0.75')),
    ];
    const rebuilt = entries.reduce(
      (acc, e) => (e.direction === LedgerDirection.Credit ? acc.add(e.money) : acc.subtract(e.money)),
      Money.zero('BRL'),
    );
    expect(rebuilt.equals(w.balance)).toBe(true);
  });

  test('rehydrate não revalida', () => {
    const w = Wallet.rehydrate({
      id: 'w1',
      playerId: 'p1',
      currency: 'BRL',
      balance: brl('42.00'),
      version: 7,
      createdAt: now,
      updatedAt: now,
    });
    expect(w.version).toBe(7);
    expect(w.balance.amount).toBe('42.00');
  });
});