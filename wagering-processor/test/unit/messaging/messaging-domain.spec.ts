import { describe, expect, test } from 'bun:test';
import { Money } from '../../../src/shared/domain/money/money';
import { Wallet } from '../../../src/modules/wallet/domain/wallet';
import { WalletBalanceChanged } from '../../../src/modules/wallet/domain/events/wallet-balance-changed.event';
import { InboxMessage, InvalidInboxStateError } from '../../../src/modules/messaging/inbox/domain/inbox-message';
import { InvalidOutboxStateError, OutboxMessage } from '../../../src/modules/messaging/outbox/domain/outbox-message';
import { ExponentialBackoff } from '../../../src/modules/messaging/outbox/domain/retry-policy';

const brl = (amount: string) => Money.from({ amount, currency: 'BRL' });
const t0 = new Date('2026-10-25T10:00:00.000Z');
const plus = (ms: number) => new Date(t0.getTime() + ms);

function makeEvent() {
  const wallet = Wallet.open({ id: 'w1', playerId: 'p1', initialBalance: brl('100.00'), now: t0 });
  const entry = wallet.debit({ entryId: 'e1', transactionId: 'tx-1', money: brl('25.00'), at: t0 });
  return WalletBalanceChanged.from(wallet, entry, { eventId: 'evt-1', correlationId: 'corr-1', occurredAt: t0 });
}

describe('ExponentialBackoff', () => {
  test('dobra a cada tentativa', () => {
    const p = new ExponentialBackoff(1_000, 300_000);
    expect([1, 2, 3, 4].map((n) => p.delayMs(n))).toEqual([1_000, 2_000, 4_000, 8_000]);
  });

  test('respeita o teto', () => {
    expect(new ExponentialBackoff(1_000, 5_000).delayMs(10)).toBe(5_000);
  });
});

describe('OutboxMessage', () => {
  test('enqueue copia o evento: id = eventId, payload = envelope', () => {
    const event = makeEvent();
    const m = OutboxMessage.enqueue(event);
    expect(m.id).toBe('evt-1');
    expect(m.aggregateId).toBe('w1');
    expect(m.eventType).toBe('WalletBalanceChanged');
    expect(m.payload).toEqual(event.toJSON() as unknown as Record<string, unknown>);
    expect(m.attempts).toBe(0);
    expect(m.isPending()).toBe(true);
    expect(m.isDue(t0)).toBe(true);
  });

  test('scheduleRetry incrementa attempts e adia a próxima tentativa com backoff', () => {
    const m = OutboxMessage.enqueue(makeEvent());

    m.scheduleRetry(t0, new ExponentialBackoff(1_000));
    expect(m.attempts).toBe(1);
    expect(m.nextAttemptAt).toEqual(plus(1_000));
    expect(m.isDue(plus(999))).toBe(false);
    expect(m.isDue(plus(1_000))).toBe(true);

    m.scheduleRetry(plus(1_000), new ExponentialBackoff(1_000));
    expect(m.attempts).toBe(2);
    expect(m.nextAttemptAt).toEqual(plus(3_000));
  });

  test('markPublished encerra: não é mais pendente nem vencida', () => {
    const m = OutboxMessage.enqueue(makeEvent());
    m.markPublished(plus(5));
    expect(m.isPending()).toBe(false);
    expect(m.isDue(plus(10_000))).toBe(false);
    expect(m.publishedAt).toEqual(plus(5));
  });

  test('publicada não pode ser publicada nem reagendada de novo', () => {
    const m = OutboxMessage.enqueue(makeEvent());
    m.markPublished(t0);
    expect(() => m.markPublished(t0)).toThrow(InvalidOutboxStateError);
    expect(() => m.scheduleRetry(t0)).toThrow(InvalidOutboxStateError);
  });
});

describe('InboxMessage', () => {
  const receive = () =>
    InboxMessage.receive({ messageId: 'msg-1', consumerName: 'wager-consumer', payloadHash: 'h', now: t0 });

  test('nasce não processada e vira processada uma única vez', () => {
    const m = receive();
    expect(m.isProcessed()).toBe(false);
    m.markProcessed(plus(5));
    expect(m.isProcessed()).toBe(true);
    expect(m.processedAt).toEqual(plus(5));
    expect(() => m.markProcessed(plus(6))).toThrow(InvalidInboxStateError);
  });

  test('rehydrate preserva o estado', () => {
    const m = InboxMessage.rehydrate({
      messageId: 'msg-1',
      consumerName: 'c',
      payloadHash: 'h',
      receivedAt: t0,
      processedAt: plus(1),
    });
    expect(m.isProcessed()).toBe(true);
  });
});