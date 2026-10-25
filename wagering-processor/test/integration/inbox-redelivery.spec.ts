import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { MikroORM } from '@mikro-orm/postgresql';
import { InboxMessage } from '../../src/modules/messaging/inbox/domain/inbox-message';
import { MikroInboxRepository } from '../../src/modules/messaging/inbox/infrastructure/mikro-inbox.repository';
import type { MikroUnitOfWork } from '../../src/shared/infrastructure/persistence/mikro-unit-of-work';
import { connect, truncateAll } from '../support/database';

let orm: MikroORM;
let uow: MikroUnitOfWork;
const inbox = new MikroInboxRepository();

const receive = (messageId = 'msg-1', consumerName = 'wager-consumer') =>
  InboxMessage.receive({ messageId, consumerName, payloadHash: 'a'.repeat(64), now: new Date() });

beforeAll(async () => {
  ({ orm, uow } = await connect());
});
afterAll(async () => {
  await orm.close();
});
beforeEach(async () => {
  await truncateAll(orm);
});

describe('inbox persistente (PostgreSQL real)', () => {
  test('a mesma mensagem entregue 50 vezes em paralelo é aceita uma única vez', async () => {
    const results = await Promise.all(Array.from({ length: 50 }, () => uow.run((tx) => inbox.insertIfAbsent(tx, receive()))));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  test('o mesmo messageId em consumidores diferentes não conflita', async () => {
    expect(await uow.run((tx) => inbox.insertIfAbsent(tx, receive('msg-1', 'consumer-a')))).toBe(true);
    expect(await uow.run((tx) => inbox.insertIfAbsent(tx, receive('msg-1', 'consumer-b')))).toBe(true);
  });

  test('redelivery depois do commit: já existe e está processada', async () => {
    const first = receive();
    await uow.run(async (tx) => {
      await inbox.insertIfAbsent(tx, first);
      first.markProcessed(new Date());
      await inbox.markProcessed(tx, first);
    });

    expect(await uow.run((tx) => inbox.insertIfAbsent(tx, receive()))).toBe(false);
    const stored = await uow.run((tx) => inbox.find(tx, 'wager-consumer', 'msg-1'));
    expect(stored?.isProcessed()).toBe(true);
    expect(stored?.payloadHash).toBe('a'.repeat(64));
  });

  test('processo morto antes do commit: a mensagem não fica registrada e pode ser reprocessada', async () => {
    await expect(
      uow.run(async (tx) => {
        await inbox.insertIfAbsent(tx, receive());
        throw new Error('processo morreu antes do commit');
      }),
    ).rejects.toThrow();

    expect(await uow.run((tx) => inbox.find(tx, 'wager-consumer', 'msg-1'))).toBeUndefined();
    expect(await uow.run((tx) => inbox.insertIfAbsent(tx, receive()))).toBe(true);
  });
});