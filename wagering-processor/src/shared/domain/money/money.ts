import Decimal from 'decimal.js';
import { CurrencyMismatchError, InvalidMoneyError } from './money.errors';
import type { MoneyProps } from './money.props';

const SCALE = 2;
// Só dígitos, com ponto e até 2 casas. Rejeita: "", "NaN", "Infinity", "1e5", "-1", "1,5", " 1".
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export class Money {
  private constructor(
    private readonly value: Decimal,
    public readonly currency: string,
  ) {}

  /** Entrada de contrato: rejeita negativos e qualquer formato inválido. */
  static from(props: MoneyProps): Money {
    if (typeof props?.amount !== 'string') {
      throw new InvalidMoneyError('amount must be a decimal string');
    }
    if (!AMOUNT_PATTERN.test(props.amount)) {
      throw new InvalidMoneyError(
        `Invalid amount "${props.amount}": expected non-negative decimal with up to ${SCALE} places`,
      );
    }
    Money.assertCurrency(props.currency);
    return new Money(new Decimal(props.amount), props.currency);
  }

  static zero(currency: string): Money {
    Money.assertCurrency(currency);
    return new Money(new Decimal(0), currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.plus(other.value), this.currency);
  }

  /** Pode resultar em valor negativo (ex.: saldo - débito). Quem decide é o domínio chamador. */
  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.minus(other.value), this.currency);
  }

  negate(): Money {
    return new Money(this.value.negated(), this.currency);
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.greaterThan(0);
  }

  isNegative(): boolean {
    return this.value.lessThan(0);
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.lessThan(other.value);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.value.equals(other.value);
  }

  /** String decimal com escala fixa de 2 casas. Usada na persistência (NUMERIC). */
  get amount(): string {
    return this.value.toFixed(SCALE);
  }

  toJSON(): MoneyProps {
    return { amount: this.amount, currency: this.currency };
  }

  toString(): string {
    return `${this.amount} ${this.currency}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }

  private static assertCurrency(currency: unknown): asserts currency is string {
    if (typeof currency !== 'string' || !CURRENCY_PATTERN.test(currency)) {
      throw new InvalidMoneyError(`Invalid currency "${String(currency)}": expected ISO-4217 code like BRL`);
    }
  }
}