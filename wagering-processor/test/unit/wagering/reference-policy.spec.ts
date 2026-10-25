import { describe, expect, test } from 'bun:test';
import { Money } from '../../../src/shared/domain/money/money';
import { FailureCode } from '../../../src/modules/wagering/domain/failure-code';
import { ReferencePolicy } from '../../../src/modules/wagering/domain/reference-policy';
import { WagerTransaction } from '../../../src/modules/wagering/domain/wager-transaction';
import { WagerTransactionKind as Kind } from '../../../src/modules/wagering/domain/wager-transaction-kind';
import { WagerTransactionStatus as Status } from '../../../src/modules/wagering/domain/wager-transaction-status';
import { InvalidWagerTransactionError } from '../../../src/modules/wagering/domain/wager.errors';

const now = new Date('2026-10-24T12:00:00Z');
const money = (amount = '25.00', currency = 'BRL') => Money.from({ amount, currency });

const base = {
  providerId: 'provider-a',
  playerId: 'p1',
  walletId: 'w1',
  roundId: 'r1',
  gameId: 'g1',
  payloadHash: 'h',
  createdAt: now,
};

const reference = (over: Partial<Parameters<typeof WagerTransaction.rehydrate>[0]> = {}) =>
  WagerTransaction.rehydrate({
    ...base,
    id: 'tx-ref',
    externalTransactionId: 'ext-ref',
    idempotencyKey: 'provider-a:ext-ref',
    kind: Kind.Bet,
    money: money(),
    status: Status.Processed,
    ...over,
  });

const reversal = (kind: Kind.Refund | Kind.Rollback = Kind.Refund, over: Partial<Parameters<typeof WagerTransaction.create>[0]> = {}) =>
  WagerTransaction.create({
    ...base,
    id: 'tx-rev',
    externalTransactionId: 'ext-rev',
    idempotencyKey: 'provider-a:ext-rev',
    kind,
    money: money(),
    referenceExternalTransactionId: 'ext-ref',
    now,
    ...over,
  });

const rejected = (code: FailureCode) => ({ type: 'REJECT' as const, code });

describe('ReferencePolicy', () => {
  test('REFUND de BET processada, consistente: PROCEED', () => {
    expect(ReferencePolicy.evaluate(reversal(), reference(), false)).toEqual({ type: 'PROCEED' });
  });

  test('ROLLBACK de BET, WIN e REFUND: PROCEED', () => {
    for (const kind of [Kind.Bet, Kind.Win, Kind.Refund]) {
      expect(ReferencePolicy.evaluate(reversal(Kind.Rollback), reference({ kind }), false)).toEqual({ type: 'PROCEED' });
    }
  });

  test('referência ausente: WAIT', () => {
    expect(ReferencePolicy.evaluate(reversal(), undefined, false)).toEqual({ type: 'WAIT' });
  });

  test('referência ainda PENDING ou PENDING_REFERENCE: WAIT', () => {
    for (const status of [Status.Pending, Status.PendingReference]) {
      expect(ReferencePolicy.evaluate(reversal(), reference({ status }), false)).toEqual({ type: 'WAIT' });
    }
  });

  test('referência REJECTED ou FAILED: REFERENCE_NOT_PROCESSED', () => {
    for (const status of [Status.Rejected, Status.Failed]) {
      expect(ReferencePolicy.evaluate(reversal(), reference({ status }), false)).toEqual(
        rejected(FailureCode.ReferenceNotProcessed),
      );
    }
  });

  test('divergências de contexto', () => {
    const cases: Array<[Partial<Parameters<typeof WagerTransaction.rehydrate>[0]>, FailureCode]> = [
      [{ providerId: 'provider-b' }, FailureCode.ReferenceMismatch],
      [{ playerId: 'p2' }, FailureCode.PlayerMismatch],
      [{ walletId: 'w2' }, FailureCode.ReferenceMismatch],
      [{ money: money('25.00', 'USD') }, FailureCode.CurrencyMismatch],
      [{ roundId: 'r2' }, FailureCode.ReferenceMismatch],
    ];
    for (const [over, code] of cases) {
      expect(ReferencePolicy.evaluate(reversal(), reference(over), false)).toEqual(rejected(code));
    }
  });

  test('REFUND só referencia BET', () => {
    for (const kind of [Kind.Win, Kind.Loss, Kind.Refund, Kind.Rollback]) {
      expect(ReferencePolicy.evaluate(reversal(Kind.Refund), reference({ kind }), false)).toEqual(
        rejected(FailureCode.InvalidReferenceKind),
      );
    }
  });

  test('ROLLBACK não referencia LOSS, ROLLBACK nem OPENING', () => {
    for (const kind of [Kind.Loss, Kind.Rollback, Kind.Opening]) {
      expect(ReferencePolicy.evaluate(reversal(Kind.Rollback), reference({ kind }), false)).toEqual(
        rejected(FailureCode.InvalidReferenceKind),
      );
    }
  });

  test('valor diferente: AMOUNT_MISMATCH (sem reversão parcial)', () => {
    expect(ReferencePolicy.evaluate(reversal(), reference({ money: money('10.00') }), false)).toEqual(
      rejected(FailureCode.AmountMismatch),
    );
  });

  test('já revertida: ALREADY_REVERSED, vale para REFUND e ROLLBACK', () => {
    expect(ReferencePolicy.evaluate(reversal(Kind.Refund), reference(), true)).toEqual(
      rejected(FailureCode.AlreadyReversed),
    );
    expect(ReferencePolicy.evaluate(reversal(Kind.Rollback), reference(), true)).toEqual(
      rejected(FailureCode.AlreadyReversed),
    );
  });

  test('ordem: divergência de contexto vem antes de tipo, valor e reversão', () => {
    const ref = reference({ playerId: 'p2', kind: Kind.Win, money: money('1.00') });
    expect(ReferencePolicy.evaluate(reversal(), ref, true)).toEqual(rejected(FailureCode.PlayerMismatch));
  });

  test('exige que a transação avaliada seja uma reversão', () => {
    const bet = WagerTransaction.create({
      ...base,
      id: 'tx-bet',
      externalTransactionId: 'ext-bet',
      idempotencyKey: 'provider-a:ext-bet',
      kind: Kind.Bet,
      money: money(),
      referenceExternalTransactionId: undefined,
      now,
    });
    expect(() => ReferencePolicy.evaluate(bet, reference(), false)).toThrow(InvalidWagerTransactionError);
  });
});