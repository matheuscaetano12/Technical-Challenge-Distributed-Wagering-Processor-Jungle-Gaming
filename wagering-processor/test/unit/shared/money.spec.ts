import { describe, expect, test } from 'bun:test';
import { Money } from '../../../src/shared/domain/money/money';
import { CurrencyMismatchError, InvalidMoneyError } from '../../../src/shared/domain/money/money.errors';

const brl = (amount: string) => Money.from({ amount, currency: 'BRL' });

describe('Money', () => {
  test('normaliza para escala fixa de 2 casas', () => {
    expect(brl('25').amount).toBe('25.00');
    expect(brl('25.5').amount).toBe('25.50');
    expect(brl('25.00').toJSON()).toEqual({ amount: '25.00', currency: 'BRL' });
  });

  test('não sofre erro de ponto flutuante', () => {
    expect(brl('0.10').add(brl('0.20')).amount).toBe('0.30');
  });

  test('é imutável: operações retornam nova instância', () => {
    const a = brl('10.00');
    const b = a.add(brl('5.00'));
    expect(a.amount).toBe('10.00');
    expect(b.amount).toBe('15.00');
  });

  test('subtract e negate podem produzir negativo internamente', () => {
    const r = brl('10.00').subtract(brl('25.00'));
    expect(r.isNegative()).toBe(true);
    expect(r.amount).toBe('-15.00');
    expect(brl('5.00').negate().amount).toBe('-5.00');
  });

  test('predicados', () => {
    expect(Money.zero('BRL').isZero()).toBe(true);
    expect(brl('0.01').isPositive()).toBe(true);
    expect(brl('1.00').isLessThan(brl('2.00'))).toBe(true);
    expect(brl('1.00').equals(brl('1.0'))).toBe(true);
  });

  test.each(['', ' ', 'NaN', 'Infinity', '-Infinity', '1e5', '1E2', '-1.00', '1,50', '1.234', '.5', '1.', 'abc'])(
    'rejeita amount inválido: "%s"',
    (amount) => {
      expect(() => brl(amount)).toThrow(InvalidMoneyError);
    },
  );

  test('rejeita amount que não é string', () => {
    expect(() => Money.from({ amount: 25 as unknown as string, currency: 'BRL' })).toThrow(InvalidMoneyError);
  });

  test.each(['', 'br', 'BRLL', 'brl', '123'])('rejeita moeda inválida: "%s"', (currency) => {
    expect(() => Money.from({ amount: '1.00', currency })).toThrow(InvalidMoneyError);
  });

  test('conflito de moeda lança erro de domínio', () => {
    const usd = Money.from({ amount: '1.00', currency: 'USD' });
    expect(() => brl('1.00').add(usd)).toThrow(CurrencyMismatchError);
    expect(() => brl('1.00').subtract(usd)).toThrow(CurrencyMismatchError);
    expect(() => brl('1.00').isLessThan(usd)).toThrow(CurrencyMismatchError);
  });

  test('equals entre moedas diferentes é false, sem lançar', () => {
    expect(brl('1.00').equals(Money.from({ amount: '1.00', currency: 'USD' }))).toBe(false);
  });
});