import { DomainError } from '../../../shared/domain/domain-error';
import type { Money } from '../../../shared/domain/money/money';

export class InsufficientBalanceError extends DomainError {
  readonly code = 'INSUFFICIENT_BALANCE';
  constructor(balance: Money, requested: Money) {
    super(`Insufficient balance: has ${balance.toString()}, requested ${requested.toString()}`);
  }
}

export class InvalidMovementError extends DomainError {
  readonly code = 'INVALID_MOVEMENT';
  constructor(message: string) {
    super(message);
  }
}

export class InvalidWalletError extends DomainError {
  readonly code = 'INVALID_WALLET';
  constructor(message: string) {
    super(message);
  }
}

export class LedgerEntryUnbalancedError extends DomainError {
  readonly code = 'LEDGER_ENTRY_UNBALANCED';
  constructor(message: string) {
    super(message);
  }
}

export class ConcurrentWalletModificationError extends DomainError {
  readonly code = 'CONCURRENT_WALLET_MODIFICATION';
  constructor(walletId: string) {
    super(`Wallet ${walletId} was modified concurrently`);
  }
}