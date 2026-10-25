import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { MikroORM } from '@mikro-orm/postgresql';
import { InboxMessage } from '../../src/modules/messaging/inbox/domain/inbox-message';
import { MikroInboxRepository } from '../../src/modules/messaging/inbox/infrastructure/mikro-inbox.repository';
import { OutboxMessage } from '../../src/modules/messaging/outbox/domain/outbox-message';
import { MikroOutboxRepository } from '../../src/modules/messaging/outbox/infrastructure/mikro-outbox.repository';
import { MikroWagerTransactionRepository } from '../../src/modules/wagering/infrastructure/persistence/mikro-wager-transaction.repository';
import { WalletBalanceChanged } from '../../src/modules/wallet/domain/events/wallet-balance-changed.event';
import { MikroLedgerRepository } from '../../src/modules/wallet/infrastructure/persistence/mikro-ledger.repository';
import { MikroWalletRepository } from '../../src/modules/wallet/infrastructure/persistence/mikro-wallet.repository';
import type { MikroUnitOfWork } from '../../src/shared/infrastructure/persistence/mikro-unit-of-work';
import { connect, countRows, truncateAll } from '../support/database';
import { newBet, openWallet } from '../support/factories';

let orm: MikroORM;
let uow: MikroUnitOfWork;
const wallets = new MikroWalletRepository();
const txs = new MikroWagerTransactionRepository();
const ledger = new MikroLedgerRepository();
const inbox = new MikroInboxRepository();
const outbox = new MikroOutboxRepository();

beforeAll(async () => {
  ({ orm, uow } = await connect());
});
afterAll(async () => {
  await orm.close();
});
beforeEach(async () => {
  await truncateAll(orm);
});

/** Uma aposta completa: inbox + transação + wallet + ledger + outbox, tudo na mesma transação SQL. */
function placeBet(walletId: string, playerId: string, failAtTheEnd: boolean) {
  return uow.run(async (tx) => {
    const now = new Date();
    const message = InboxMessage.receive({ messageId: 'msg-1', consumerName: 'wager-consumer', payloadHash: 'h'.repeat(64), now });
    await inbox.insertIfAbsent(tx, message);

    const wallet = (await wallets.findByIdForUpdate(tx, walletId))!;
    const expectedVersion = wallet.version;
    const bet = newBet({ id: walletId, playerId } as never, 'tx-1');
    await txs.insertIfAbsent(tx, bet);

    const entry = wallet.debit({ entryId: randomUUID(), transactionId: bet.id, money: bet.money, at: now });
    await ledger.insert(tx, entry);
    await wallets.updateBalance(tx, wallet, expectedVersion);

    bet.markProcessed(undefined, now, wallet.balance);
    await txs.update(tx, bet);

    await outbox.insert(
      tx,
      OutboxMessage.enqueue(
        WalletBalanceChanged.from(wallet, entry, { eventId: randomUUID(), correlationId: randomUUID(), occurredAt: now }),
      ),
    );

    message.markProcessed(now);
    await inbox.markProcessed(tx, message);

    if (failAtTheEnd) throw new Error('falha depois de todas as escritas, antes do commit');
  });
}

async function setup() {
  const wallet = openWallet('100.00');
  await uow.run((tx) => wallets.insert(tx, wallet));
  return wallet;
}

const TABLES = ['wager_transactions', 'wallet_ledger_entries', 'inbox_messages', 'outbox_messages'];

describe('atomicidade: inbox, transação, wallet, ledger e outbox na mesma transação', () => {
  test('falha antes do commit: nada é gravado e o saldo não muda', async () => {
    const wallet = await setup();

    await expect(placeBet(wallet.id, wallet.playerId, true)).rejects.toThrow();

    for (const table of TABLES) expect(await countRows(orm, table)).toBe(0);
    const stored = await uow.run((tx) => wallets.findById(tx, wallet.id));
    expect(stored!.balance.amount).toBe('100.00');
    expect(stored!.version).toBe(1);
  });

  test('commit: tudo é gravado junto e o saldo bate com o ledger', async () => {
    const wallet = await setup();

    await placeBet(wallet.id, wallet.playerId, false);

    for (const table of TABLES) expect(await countRows(orm, table)).toBe(1);
    const stored = await uow.run((tx) => wallets.findById(tx, wallet.id));
    expect(stored!.balance.amount).toBe('75.00');
    expect(stored!.version).toBe(2);

    const totals = await uow.run((tx) => ledger.totalsForWallet(tx, wallet.id, 'BRL'));
    expect(totals.debits.amount).toBe('25.00');

    // O evento está na outbox, pendente de publicação, gravado na mesma transação do débito.
    const [event] = await uow.run((tx) => outbox.claimDue(tx, new Date(), 10));
    expect(event!.eventType).toBe('WalletBalanceChanged');
  });

  test('retry depois de uma falha: o débito acontece uma única vez', async () => {
    const wallet = await setup();

    await expect(placeBet(wallet.id, wallet.playerId, true)).rejects.toThrow();
    await placeBet(wallet.id, wallet.playerId, false);

    const stored = await uow.run((tx) => wallets.findById(tx, wallet.id));
    expect(stored!.balance.amount).toBe('75.00');
    expect(await countRows(orm, 'wallet_ledger_entries')).toBe(1);
  });
});