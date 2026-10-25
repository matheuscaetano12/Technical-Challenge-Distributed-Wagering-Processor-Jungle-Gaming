import { Money } from '../../../shared/domain/money/money';
import { LedgerDirection } from '../../wallet/domain/ledger-direction';
import type { FailureCode } from './failure-code';
import { WagerTransactionKind as Kind } from './wager-transaction-kind';
import { WagerTransactionStatus as Status } from './wager-transaction-status';
import { InvalidTransactionStateError, InvalidWagerTransactionError } from './wager.errors';

export interface WagerTransactionState {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: Kind;
  money: Money;
  referenceExternalTransactionId?: string;
  createdAt: Date;
  status: Status;
  referenceTransactionId?: string;
  failureCode?: FailureCode;
  processedAt?: Date;
  balanceObserved?: Money;
}

export type CreateWagerTransactionProps = Omit<
  WagerTransactionState,
  'status' | 'referenceTransactionId' | 'failureCode' | 'processedAt' | 'balanceObserved' | 'createdAt'
> & { now: Date };

export interface CreateOpeningProps {
  id: string;
  walletId: string;
  playerId: string;
  money: Money;
  payloadHash: string;
  now: Date;
}

const TERMINAL: ReadonlySet<Status> = new Set([Status.Processed, Status.Rejected, Status.Failed]);
const BALANCE_AFFECTING: ReadonlySet<Kind> = new Set([Kind.Opening, Kind.Bet, Kind.Win, Kind.Refund, Kind.Rollback]);

export const INTERNAL_PROVIDER_ID = 'internal';

export class WagerTransaction {
  private constructor(
    public readonly id: string,
    public readonly providerId: string,
    public readonly externalTransactionId: string,
    public readonly idempotencyKey: string,
    public readonly payloadHash: string,
    public readonly walletId: string,
    public readonly playerId: string,
    public readonly roundId: string,
    public readonly gameId: string,
    public readonly kind: Kind,
    public readonly money: Money,
    /** id no provedor, não o id interno */
    public readonly referenceExternalTransactionId: string | undefined,
    public readonly createdAt: Date,
    private _status: Status,
    private _referenceTransactionId?: string,
    private _failureCode?: FailureCode,
    private _processedAt?: Date,
    private _balanceObserved?: Money,
  ) {}

  /** Nasce em PENDING. Rejeita OPENING (interno) e valida a exigência de referência por kind. */
  static create(props: CreateWagerTransactionProps): WagerTransaction {
    if (props.kind === Kind.Opening) {
      throw new InvalidWagerTransactionError('OPENING is internal and cannot be submitted');
    }
    const needsReference = props.kind === Kind.Refund || props.kind === Kind.Rollback;
    const hasReference = !!props.referenceExternalTransactionId;
    if (needsReference && !hasReference) {
      throw new InvalidWagerTransactionError(`${props.kind} requires referenceExternalTransactionId`);
    }
    if (!needsReference && hasReference) {
      throw new InvalidWagerTransactionError(`${props.kind} must not carry referenceExternalTransactionId`);
    }
    if (BALANCE_AFFECTING.has(props.kind) && !props.money.isPositive()) {
      throw new InvalidWagerTransactionError(`${props.kind} amount must be greater than zero`);
    }
    return new WagerTransaction(
      props.id,
      props.providerId,
      props.externalTransactionId,
      props.idempotencyKey,
      props.payloadHash,
      props.walletId,
      props.playerId,
      props.roundId,
      props.gameId,
      props.kind,
      props.money,
      props.referenceExternalTransactionId,
      props.now,
      Status.Pending,
    );
  }

  /** Transação interna de abertura da wallet. Chave determinística: 1 por wallet. */
  static createOpening(props: CreateOpeningProps): WagerTransaction {
    if (!props.money.isPositive()) {
      throw new InvalidWagerTransactionError('OPENING amount must be greater than zero');
    }
    const external = `opening:${props.walletId}`;
    return new WagerTransaction(
      props.id,
      INTERNAL_PROVIDER_ID,
      external,
      external,
      props.payloadHash,
      props.walletId,
      props.playerId,
      'opening',
      'opening',
      Kind.Opening,
      props.money,
      undefined,
      props.now,
      Status.Pending,
    );
  }

  /** Reconstrução a partir da persistência: não revalida transições. */
  static rehydrate(s: WagerTransactionState): WagerTransaction {
    return new WagerTransaction(
      s.id,
      s.providerId,
      s.externalTransactionId,
      s.idempotencyKey,
      s.payloadHash,
      s.walletId,
      s.playerId,
      s.roundId,
      s.gameId,
      s.kind,
      s.money,
      s.referenceExternalTransactionId,
      s.createdAt,
      s.status,
      s.referenceTransactionId,
      s.failureCode,
      s.processedAt,
      s.balanceObserved,
    );
  }

  get status(): Status {
    return this._status;
  }
  get referenceTransactionId(): string | undefined {
    return this._referenceTransactionId;
  }
  get failureCode(): FailureCode | undefined {
    return this._failureCode;
  }
  get processedAt(): Date | undefined {
    return this._processedAt;
  }
  /** Saldo da wallet no momento em que foi processada (usado no replay). */
  get balanceObserved(): Money | undefined {
    return this._balanceObserved;
  }

  // ---- transições (lançam InvalidTransactionStateError se não permitidas)

  markProcessed(referenceTransactionId: string | undefined, at: Date, balanceObserved?: Money): void {
    this.assertTransition(Status.Processed, [Status.Pending, Status.PendingReference]);
    if (this.requiresReference() && !referenceTransactionId) {
      throw new InvalidWagerTransactionError(`${this.kind} cannot be processed without a resolved reference`);
    }
    if (!this.requiresReference() && referenceTransactionId) {
      throw new InvalidWagerTransactionError(`${this.kind} does not take a reference`);
    }
    this._status = Status.Processed;
    this._referenceTransactionId = referenceTransactionId;
    this._processedAt = at;
    this._balanceObserved = balanceObserved;
  }

  markPendingReference(): void {
    this.assertTransition(Status.PendingReference, [Status.Pending]);
    if (!this.requiresReference()) {
      throw new InvalidWagerTransactionError(`${this.kind} never waits for a reference`);
    }
    this._status = Status.PendingReference;
  }

  reject(code: FailureCode): void {
    this.assertTransition(Status.Rejected, [Status.Pending, Status.PendingReference]);
    this._status = Status.Rejected;
    this._failureCode = code;
  }

  fail(code: FailureCode): void {
    this.assertTransition(Status.Failed, [Status.Pending, Status.PendingReference]);
    this._status = Status.Failed;
    this._failureCode = code;
  }

  // ---- consultas de domínio

  isTerminal(): boolean {
    return TERMINAL.has(this._status);
  }

  affectsBalance(): boolean {
    return BALANCE_AFFECTING.has(this.kind);
  }

  requiresReference(): boolean {
    return this.kind === Kind.Refund || this.kind === Kind.Rollback;
  }

  matchesPayload(payloadHash: string): boolean {
    return this.payloadHash === payloadHash;
  }

  /**
   * Direção do lançamento no ledger.
   * ROLLBACK é o inverso da transação referenciada, então exige a referência.
   */
  ledgerDirectionFor(reference?: WagerTransaction): LedgerDirection {
    switch (this.kind) {
      case Kind.Opening:
      case Kind.Win:
      case Kind.Refund:
        return LedgerDirection.Credit;
      case Kind.Bet:
        return LedgerDirection.Debit;
      case Kind.Loss:
        throw new InvalidWagerTransactionError('LOSS does not affect balance');
      case Kind.Rollback: {
        if (!reference) {
          throw new InvalidWagerTransactionError('ROLLBACK needs the referenced transaction to define its direction');
        }
        if (!reference.affectsBalance() || reference.kind === Kind.Rollback || reference.kind === Kind.Opening) {
          throw new InvalidWagerTransactionError(`ROLLBACK cannot reverse a ${reference.kind}`);
        }
        return reference.ledgerDirectionFor() === LedgerDirection.Debit
          ? LedgerDirection.Credit
          : LedgerDirection.Debit;
      }
    }
  }

  private assertTransition(to: Status, allowedFrom: Status[]): void {
    if (!allowedFrom.includes(this._status)) {
      throw new InvalidTransactionStateError(this._status, to);
    }
  }
}