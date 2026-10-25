import { DomainError } from '../domain-error';

export class InvalidMoneyError extends DomainError {
  readonly code = 'INVALID_MONEY';
  constructor(message: string) {
    super(message);
  }
}

export class CurrencyMismatchError extends DomainError {
  readonly code = 'CURRENCY_MISMATCH';
  constructor(left: string, right: string) {
    super(`Currency mismatch: ${left} vs ${right}`);
  }
}