import { DomainError } from '../../../shared/domain/domain-error';

/** Erro de programação: tentativa de transição inválida (ex.: a partir de estado terminal). */
export class InvalidTransactionStateError extends DomainError {
  readonly code = 'INVALID_TRANSACTION_STATE';
  constructor(from: string, to: string) {
    super(`Invalid transition: ${from} -> ${to}`);
  }
}

export class InvalidWagerTransactionError extends DomainError {
  readonly code = 'INVALID_WAGER_TRANSACTION';
  constructor(message: string) {
    super(message);
  }
}