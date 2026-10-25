import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import config from '../../mikro-orm.config';
import { Money } from '../../src/shared/domain/money/money';
import { MikroUnitOfWork } from '../../src/shared/infrastructure/persistence/mikro-unit-of-work';
import { Wallet } from '../../src/modules/wallet/domain/wallet';
import {
  ConcurrentWalletModificationError,
  InsufficientBalanceError,
} from '../../src/modules/wallet/domain/wallet.errors';
import { MikroWalletRepository } from '../../src/modules/wallet/infrastructure/persistence/mikro-wallet.repository';

const brl = (amount: string) => Money.from({ amount, currency: 'BRL' });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let orm: MikroORM;
let uow: MikroUnitOfWork;
const repo = new MikroWalletRepository();

async function createWallet(initial: string): Promise<string> {
  const id = randomUUID();
  await uow.run((tx) =>
    repo.insert(tx, Wallet.open({ id, playerId: randomUUID(), initialBalance: brl(initial), now: new Date() })),
  );
  return id;
}

async function readWallet(id: string) {
  const wallet = await uow.run((tx) => repo.findById(tx, id));
  if (!wallet) throw new Error('wallet not found');
  return wallet;
}

/** Aposta com lock pessimista. O sleep força as transações a se sobrepor. */
function bet(walletId: string, amount: string) {
  return uow.run(async (tx) => {
    const wallet = await repo.findByIdForUpdate(tx, walletId);
    if (!wallet) throw new Error('wallet not found');
    const expectedVersion = wallet.version;
    wallet.debit({ entryId: randomUUID(), transactionId: randomUUID(), money: brl(amount), at: new Date() });
    await sleep(100);
    await repo.updateBalance(tx, wallet, expectedVersion);
  });
}

beforeAll(async () => {
  orm = await MikroORM.init(config);
  uow = new MikroUnitOfWork(orm);
});

afterAll(async () => {
  await orm.close();
});

beforeEach(async () => {
  await orm.em.execute(
    'truncate table wallet_ledger_entries, wager_transactions, wallets, inbox_messages, outbox_messages cascade',
  );
});

describe('concorrência na wallet (PostgreSQL real)', () => {
  test('seção 8: saldo 100.00 e duas apostas de 80.00 -> uma passa, saldo final 20.00', async () => {
    const id = await createWallet('100.00');

    const results = await Promise.allSettled([bet(id, '80.00'), bet(id, '80.00')]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.reason).toBeInstanceOf(InsufficientBalanceError);

    const wallet = await readWallet(id);
    expect(wallet.balance.amount).toBe('20.00');
    expect(wallet.version).toBe(2);
  });

  test('20 débitos de 10.00 em paralelo sobre 100.00 -> exatamente 10 passam, saldo zero', async () => {
    const id = await createWallet('100.00');

    const results = await Promise.allSettled(Array.from({ length: 20 }, () => bet(id, '10.00')));

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
    const wallet = await readWallet(id);
    expect(wallet.balance.amount).toBe('0.00');
    expect(wallet.version).toBe(11);
  });

  test('wallets diferentes não se bloqueiam (sem lock global)', async () => {
    const ids = await Promise.all(Array.from({ length: 5 }, () => createWallet('100.00')));

    const started = Date.now();
    await Promise.all(ids.map((id) => bet(id, '30.00')));
    const elapsed = Date.now() - started;

    // Cada aposta dorme 100 ms dentro do lock. Se houvesse lock global, levaria ~500 ms.
    expect(elapsed).toBeLessThan(450);
    for (const id of ids) {
      expect((await readWallet(id)).balance.amount).toBe('70.00');
    }
  });

  test('guarda de versão: update com versão defasada é recusado', async () => {
    const id = await createWallet('100.00');

    await expect(
      uow.run(async (tx) => {
        const wallet = await repo.findById(tx, id); // leitura sem lock, de propósito
        wallet!.debit({ entryId: randomUUID(), transactionId: randomUUID(), money: brl('10.00'), at: new Date() });
        await repo.updateBalance(tx, wallet!, 99); // versão esperada errada
      }),
    ).rejects.toBeInstanceOf(ConcurrentWalletModificationError);

    expect((await readWallet(id)).balance.amount).toBe('100.00');
  });
});