import { describe, expect, test } from 'bun:test';
import { Money } from '../../../src/shared/domain/money/money';
import type { EventContext } from '../../../src/shared/domain/integration-event';
import { FailureCode } from '../../../src/modules/wagering/domain/failure-code';
import { WagerTransactionPendingReference } from '../../../src/modules/wagering/domain/events/wager-transaction-pending-reference.event';
import { WagerTransactionProcessed } from '../../../src/modules/wagering/domain/events/wager-transaction-processed.event';
import { WagerTransactionRejected } from '../../../src/modules/wagering/domain/events/wager-transaction-rejected.event';
import { WagerTransaction } from '../../../src/modules/wagering/domain/wager-transaction';
import { WagerTransactionKind as Kind } from '../../../src/modules/wagering/domain/wager-transaction-kind';
import { WagerTransactionStatus as Status } from '../../../src/modules/wagering/domain/wager-transaction-status';
import { WalletBalanceChanged } from '../../../src/modules/wallet/domain/events/wallet-balance-changed.event';
import { Wallet } from '../../../src/modules/wallet/domain/wallet';
import { LedgerDirection } from '../../../src/modules/wallet/domain/ledger-direction';

const brl = (amount: string) => Money.from({ amount, currency: 'BRL' });
const at = new Date('2026-10-25T10:00:00.000Z');
const ctx: EventContext = { eventId: 'evt-1', correlationId: 'corr-1', causationId: 'cause-1', occurredAt: at };

const tx = (over: Partial<Parameters<typeof WagerTransaction.rehydrate>[0]> = {}) =>
  WagerTransaction.rehydrate({
    id: 'tx-1',
    providerId: 'provider-a',
    externalTransactionId: 'ext-1',
    idempotencyKey: 'provider-a:ext-1',
    payloadHash: 'h',
    walletId: 'w1',
    playerId: 'p1',
    roundId: 'r1',
    gameId: 'g1',
    kind: Kind.Bet,
    money: brl('25.00'),
    createdAt: at,
    status: Status.Processed,
    balanceObserved: brl('75.00'),
    processedAt: at,
    ...over,
  });

describe('WalletBalanceChanged', () => {
  test('carrega eventType, version e envelope completo', () => {
    const wallet = Wallet.open({ id: 'w1', playerId: 'p1', initialBalance: brl('100.00'), now: at });
    const entry = wallet.debit({ entryId: 'e1', transactionId: 'tx-1', money: brl('25.00'), at });

    const event = WalletBalanceChanged.from(wallet, entry, ctx);
    const json = event.toJSON();

    expect(json.eventType).toBe('WalletBalanceChanged');
    expect(json.version).toBe(1);
    expect(json.eventId).toBe('evt-1');
    expect(json.aggregateId).toBe('w1');
    expect(json.correlationId).toBe('corr-1');
    expect(json.causationId).toBe('cause-1');
    expect(json.occurredAt).toBe('2026-10-25T10:00:00.000Z');
    expect(json.data).toEqual({
      walletId: 'w1',
      transactionId: 'tx-1',
      direction: LedgerDirection.Debit,
      money: { amount: '25.00', currency: 'BRL' },
      balanceBefore: { amount: '100.00', currency: 'BRL' },
      balanceAfter: { amount: '75.00', currency: 'BRL' },
      walletVersion: 2,
    });
  });

  test('o payload é JSON estável: nenhuma instância de Money, só strings decimais', () => {
    const wallet = Wallet.open({ id: 'w1', playerId: 'p1', initialBalance: brl('100.00'), now: at });
    const entry = wallet.credit({ entryId: 'e1', transactionId: 'tx-1', money: brl('1.50'), at });
    const json = WalletBalanceChanged.from(wallet, entry, ctx).toJSON();
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
  });
});

describe('eventos de WagerTransaction', () => {
  test('Processed usa a wallet como aggregate e leva o saldo observado', () => {
    const json = WagerTransactionProcessed.from(tx(), ctx).toJSON();
    expect(json.eventType).toBe('WagerTransactionProcessed');
    expect(json.aggregateId).toBe('w1');
    expect(json.data.transactionId).toBe('tx-1');
    expect(json.data.balance).toEqual({ amount: '75.00', currency: 'BRL' });
  });

  test('Processed exige saldo observado', () => {
    expect(() => WagerTransactionProcessed.from(tx({ balanceObserved: undefined }), ctx)).toThrow();
  });

  test('Rejected leva o failureCode', () => {
    const rejected = tx({ status: Status.Rejected, failureCode: FailureCode.InsufficientFunds, balanceObserved: undefined });
    const json = WagerTransactionRejected.from(rejected, ctx).toJSON();
    expect(json.eventType).toBe('WagerTransactionRejected');
    expect(json.data.failureCode).toBe('INSUFFICIENT_FUNDS');
  });

  test('Rejected sem failureCode é erro', () => {
    expect(() => WagerTransactionRejected.from(tx(), ctx)).toThrow();
  });

  test('PendingReference leva a referência esperada', () => {
    const pending = tx({
      kind: Kind.Refund,
      status: Status.PendingReference,
      referenceExternalTransactionId: 'ext-bet',
      balanceObserved: undefined,
      processedAt: undefined,
    });
    const json = WagerTransactionPendingReference.from(pending, ctx).toJSON();
    expect(json.eventType).toBe('WagerTransactionPendingReference');
    expect(json.data.referenceExternalTransactionId).toBe('ext-bet');
  });

  test('PendingReference sem referência é erro', () => {
    expect(() => WagerTransactionPendingReference.from(tx(), ctx)).toThrow();
  });
});