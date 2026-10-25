import { describe, expect, test } from 'bun:test';
import { Money } from '../../../src/shared/domain/money/money';
import { LedgerDirection } from '../../../src/modules/wallet/domain/ledger-direction';
import { FailureCode } from '../../../src/modules/wagering/domain/failure-code';
import { WagerTransaction } from '../../../src/modules/wagering/domain/wager-transaction';
import { WagerTransactionKind as Kind } from '../../../src/modules/wagering/domain/wager-transaction-kind';
import { WagerTransactionStatus as Status } from '../../../src/modules/wagering/domain/wager-transaction-status';
import {
  InvalidTransactionStateError,
  InvalidWagerTransactionError,
} from '../../../src/modules/wagering/domain/wager.errors';

const brl = (amount: string) => Money.from({ amount, currency: 'BRL' });
const now = new Date('2026-10-24T12:00:00Z');

const make = (kind: Kind, extra: Partial<Parameters<typeof WagerTransaction.create>[0]> = {}) =>
  WagerTransaction.create({
    id: `tx-${kind}`,
    providerId: 'provider-a',
    externalTransactionId: `ext-${kind}`,
    idempotencyKey: `provider-a:ext-${kind}`,
    payloadHash: 'hash-1',
    walletId: 'w1',
    playerId: 'p1',
    roundId: 'r1',
    gameId: 'g1',
    kind,
    money: brl('25.00'),
    referenceExternalTransactionId:
      kind === Kind.Refund || kind === Kind.Rollback ? 'ext-BET' : undefined,
    now,
    ...extra,
  });

describe('WagerTransaction.create', () => {
  test('nasce PENDING', () => {
    expect(make(Kind.Bet).status).toBe(Status.Pending);
  });

  test('OPENING não pode ser submetido', () => {
    expect(() => make(Kind.Opening)).toThrow(InvalidWagerTransactionError);
  });

  test('REFUND e ROLLBACK exigem referência', () => {
    expect(() => make(Kind.Refund, { referenceExternalTransactionId: undefined })).toThrow(InvalidWagerTransactionError);
    expect(() => make(Kind.Rollback, { referenceExternalTransactionId: undefined })).toThrow(InvalidWagerTransactionError);
  });

  test('BET, WIN e LOSS não aceitam referência', () => {
    for (const k of [Kind.Bet, Kind.Win, Kind.Loss]) {
      expect(() => make(k, { referenceExternalTransactionId: 'x' })).toThrow(InvalidWagerTransactionError);
    }
  });

  test('valor zero só é aceito em LOSS', () => {
    expect(() => make(Kind.Bet, { money: brl('0.00') })).toThrow(InvalidWagerTransactionError);
    expect(make(Kind.Loss, { money: brl('0.00') }).status).toBe(Status.Pending);
  });
});

describe('WagerTransaction.createOpening', () => {
  test('é interna, com chave determinística por wallet', () => {
    const t = WagerTransaction.createOpening({
      id: 'op1', walletId: 'w1', playerId: 'p1', money: brl('1000.00'), payloadHash: 'h', now,
    });
    expect(t.kind).toBe(Kind.Opening);
    expect(t.providerId).toBe('internal');
    expect(t.idempotencyKey).toBe('opening:w1');
    expect(t.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
  });
});

describe('transições', () => {
  test('PENDING -> PROCESSED guarda saldo observado', () => {
    const t = make(Kind.Bet);
    t.markProcessed(undefined, now, brl('975.00'));
    expect(t.status).toBe(Status.Processed);
    expect(t.processedAt).toEqual(now);
    expect(t.balanceObserved?.amount).toBe('975.00');
    expect(t.isTerminal()).toBe(true);
  });

  test('PENDING -> PENDING_REFERENCE -> PROCESSED (com referência)', () => {
    const t = make(Kind.Refund);
    t.markPendingReference();
    expect(t.status).toBe(Status.PendingReference);
    expect(t.isTerminal()).toBe(false);
    t.markProcessed('tx-BET', now);
    expect(t.status).toBe(Status.Processed);
    expect(t.referenceTransactionId).toBe('tx-BET');
  });

  test('PENDING_REFERENCE -> REJECTED com REFERENCE_NOT_FOUND', () => {
    const t = make(Kind.Rollback);
    t.markPendingReference();
    t.reject(FailureCode.ReferenceNotFound);
    expect(t.status).toBe(Status.Rejected);
    expect(t.failureCode).toBe(FailureCode.ReferenceNotFound);
  });

  test('PENDING -> FAILED', () => {
    const t = make(Kind.Bet);
    t.fail(FailureCode.InternalError);
    expect(t.status).toBe(Status.Failed);
  });

  test('BET nunca vai para PENDING_REFERENCE', () => {
    expect(() => make(Kind.Bet).markPendingReference()).toThrow(InvalidWagerTransactionError);
  });

  test('REFUND/ROLLBACK só processam com referência resolvida', () => {
    expect(() => make(Kind.Refund).markProcessed(undefined, now)).toThrow(InvalidWagerTransactionError);
    expect(() => make(Kind.Bet).markProcessed('tx-x', now)).toThrow(InvalidWagerTransactionError);
  });

  test.each([
    ['PROCESSED', (t: WagerTransaction) => t.markProcessed(undefined, now)],
    ['REJECTED', (t: WagerTransaction) => t.reject(FailureCode.InsufficientFunds)],
    ['FAILED', (t: WagerTransaction) => t.fail(FailureCode.InternalError)],
  ])('estado terminal %s não transiciona mais', (_name, toTerminal) => {
    const t = make(Kind.Bet);
    toTerminal(t);
    expect(() => t.markProcessed(undefined, now)).toThrow(InvalidTransactionStateError);
    expect(() => t.reject(FailureCode.InsufficientFunds)).toThrow(InvalidTransactionStateError);
    expect(() => t.fail(FailureCode.InternalError)).toThrow(InvalidTransactionStateError);
    expect(() => t.markPendingReference()).toThrow(InvalidTransactionStateError);
  });

  test('PENDING_REFERENCE -> PENDING_REFERENCE é inválido', () => {
    const t = make(Kind.Refund);
    t.markPendingReference();
    expect(() => t.markPendingReference()).toThrow(InvalidTransactionStateError);
  });
});

describe('consultas de domínio', () => {
  test('affectsBalance: false só para LOSS', () => {
    expect(make(Kind.Loss).affectsBalance()).toBe(false);
    for (const k of [Kind.Bet, Kind.Win, Kind.Refund, Kind.Rollback]) {
      expect(make(k).affectsBalance()).toBe(true);
    }
  });

  test('requiresReference: só REFUND e ROLLBACK', () => {
    expect(make(Kind.Refund).requiresReference()).toBe(true);
    expect(make(Kind.Rollback).requiresReference()).toBe(true);
    expect(make(Kind.Bet).requiresReference()).toBe(false);
  });

  test('matchesPayload compara o hash', () => {
    const t = make(Kind.Bet);
    expect(t.matchesPayload('hash-1')).toBe(true);
    expect(t.matchesPayload('hash-2')).toBe(false);
  });

  test('ledgerDirectionFor: BET debita; WIN e REFUND creditam', () => {
    expect(make(Kind.Bet).ledgerDirectionFor()).toBe(LedgerDirection.Debit);
    expect(make(Kind.Win).ledgerDirectionFor()).toBe(LedgerDirection.Credit);
    expect(make(Kind.Refund).ledgerDirectionFor()).toBe(LedgerDirection.Credit);
  });

  test('LOSS não tem direção', () => {
    expect(() => make(Kind.Loss).ledgerDirectionFor()).toThrow(InvalidWagerTransactionError);
  });

  test('ROLLBACK é o inverso da referência', () => {
    const rollback = make(Kind.Rollback);
    expect(rollback.ledgerDirectionFor(make(Kind.Bet))).toBe(LedgerDirection.Credit);
    expect(rollback.ledgerDirectionFor(make(Kind.Win))).toBe(LedgerDirection.Debit);
    expect(rollback.ledgerDirectionFor(make(Kind.Refund))).toBe(LedgerDirection.Debit);
  });

  test('ROLLBACK sem referência, ou sobre LOSS/ROLLBACK, é inválido', () => {
    const rollback = make(Kind.Rollback);
    expect(() => rollback.ledgerDirectionFor()).toThrow(InvalidWagerTransactionError);
    expect(() => rollback.ledgerDirectionFor(make(Kind.Loss))).toThrow(InvalidWagerTransactionError);
    expect(() => rollback.ledgerDirectionFor(make(Kind.Rollback))).toThrow(InvalidWagerTransactionError);
  });
});

describe('rehydrate', () => {
  test('reconstrói estado terminal sem revalidar', () => {
    const t = WagerTransaction.rehydrate({
      id: 't1', providerId: 'p', externalTransactionId: 'e', idempotencyKey: 'p:e', payloadHash: 'h',
      walletId: 'w', playerId: 'pl', roundId: 'r', gameId: 'g', kind: Kind.Bet, money: brl('1.00'),
      createdAt: now, status: Status.Rejected, failureCode: FailureCode.InsufficientFunds,
    });
    expect(t.isTerminal()).toBe(true);
    expect(t.failureCode).toBe(FailureCode.InsufficientFunds);
  });
});