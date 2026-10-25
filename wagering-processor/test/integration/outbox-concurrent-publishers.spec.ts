import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { MikroORM } from '@mikro-orm/postgresql';
import { OutboxMessage } from '../../src/modules/messaging/outbox/domain/outbox-message';
import { MikroOutboxRepository } from '../../src/modules/messaging/outbox/infrastructure/mikro-outbox.repository';
import { WalletBalanceChanged } from '../../src/modules/wallet/domain/events/wallet-balance-changed.event';
import type { MikroUnitOfWork } from '../../src/shared/infrastructure/persistence/mikro-unit-of-work';
import { brl, openWallet } from '../support/factories';
import { connect, countRows, truncateAll } from '../support/database';

let orm: MikroORM;
let uow: MikroUnitOfWork;
const outbox = new MikroOutboxRepository();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeMessage(occurredAt = new Date()): OutboxMessage {
  const wallet = openWallet('100.00');
  const entry = wallet.debit({ entryId: randomUUID(), transactionId: randomUUID(), money: brl('1.00'), at: occurredAt });
  return OutboxMessage.enqueue(
    WalletBalanceChanged.from(wallet, entry, { eventId: randomUUID(), correlationId: randomUUID(), occurredAt }),
  );
}

async function seed(n: number): Promise<OutboxMessage[]> {
  const messages = Array.from({ length: n }, (_, i) => makeMessage(new Date(Date.now() + i)));
  await uow.run(async (tx) => {
    for (const m of messages) await outbox.insert(tx, m);
  });
  return messages;
}

beforeAll(async () => {
  ({ orm, uow } = await connect());
});
afterAll(async () => {
  await orm.close();
});
beforeEach(async () => {
  await truncateAll(orm);
});

describe('outbox com publishers concorrentes (PostgreSQL real)', () => {
  test('dois publishers simultâneos recebem lotes disjuntos', async () => {
    await seed(20);

    // Cada publisher segura as linhas travadas por 200 ms, para as transações se sobreporem.
    const claim = () =>
      uow.run(async (tx) => {
        const batch = await outbox.claimDue(tx, new Date(), 10);
        await sleep(200);
        return batch.map((m) => m.id);
      });

    const [a, b] = await Promise.all([claim(), claim()]);

    expect(a).toHaveLength(10);
    expect(b).toHaveLength(10);
    expect(new Set([...a, ...b]).size).toBe(20); // nenhuma mensagem em dois publishers
  });

  test('publisher morto antes do commit: as mensagens voltam a ficar disponíveis', async () => {
    await seed(5);

    await expect(
      uow.run(async (tx) => {
        const batch = await outbox.claimDue(tx, new Date(), 5);
        for (const m of batch) {
          m.markPublished(new Date());
          await outbox.markPublished(tx, m);
        }
        throw new Error('processo morreu antes do commit');
      }),
    ).rejects.toThrow();

    // Rollback: nada foi dado como publicado, e outra instância assume o trabalho.
    const retaken = await uow.run((tx) => outbox.claimDue(tx, new Date(), 10));
    expect(retaken).toHaveLength(5);
    expect(retaken.every((m) => m.isPending())).toBe(true);
  });

  test('depois de publicar e commitar, nada mais está pendente', async () => {
    await seed(5);

    await uow.run(async (tx) => {
      for (const m of await outbox.claimDue(tx, new Date(), 10)) {
        m.markPublished(new Date());
        await outbox.markPublished(tx, m);
      }
    });

    expect(await uow.run((tx) => outbox.claimDue(tx, new Date(), 10))).toHaveLength(0);
    expect(await countRows(orm, 'outbox_messages')).toBe(5);
  });

  test('mensagem com retry agendado só é reivindicada quando vence', async () => {
    const [m] = await seed(1);
    const now = new Date();

    await uow.run(async (tx) => {
      const [claimed] = await outbox.claimDue(tx, now, 1);
      claimed!.scheduleRetry(now);
      await outbox.saveRetry(tx, claimed!);
    });

    expect(await uow.run((tx) => outbox.claimDue(tx, now, 10))).toHaveLength(0);

    const later = new Date(now.getTime() + 2_000);
    const due = await uow.run((tx) => outbox.claimDue(tx, later, 10));
    expect(due).toHaveLength(1);
    expect(due[0]!.id).toBe(m!.id);
    expect(due[0]!.attempts).toBe(1);
  });

  test('o payload JSONB volta idêntico ao envelope gravado', async () => {
    const [m] = await seed(1);
    const [loaded] = await uow.run((tx) => outbox.claimDue(tx, new Date(), 1));
    expect(loaded!.payload).toEqual(m!.payload);
  });
});