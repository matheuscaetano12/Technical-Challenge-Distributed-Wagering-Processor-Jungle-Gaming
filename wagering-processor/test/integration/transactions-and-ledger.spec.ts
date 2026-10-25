import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { MikroORM } from '@mikro-orm/postgresql';
import config from '../../mikro-orm.config';
import { Money } from '../../src/shared/domain/money/money';
import { computePayloadHash } from '../../src/shared/infrastructure/hashing/payload-hash';
import { MikroUnitOfWork } from '../../src/shared/infrastructure/persistence/mikro-unit-of-work';
import { Wallet } from '../../src/modules/wallet/domain/wallet';
import { MikroLedgerRepository } from '../../src/modules/wallet/infrastructure/persistence/mikro-ledger.repository';
import { MikroWalletRepository } from '../../src/modules/wallet/infrastructure/persistence/mikro-wallet.repository';
import { WagerTransaction } from '../../src/modules/wagering/domain/wager-transaction';
import { WagerTransactionKind as Kind } from '../../src/modules/wagering/domain/wager-transaction-kind';
import { WagerTransactionStatus as Status } from '../../src/modules/wagering/domain/wager-transaction-status';
import { MikroWagerTransactionRepository } from '../../src/modules/wagering/infrastructure/persistence/mikro-wager-transaction.repository';

const brl = (amount: string) => Money.from({ amount, currency: 'BRL' });

let orm: MikroORM;
let uow: MikroUnitOfWork;
const wallets = new MikroWalletRepository();
const txs = new MikroWagerTransactionRepository();
const ledger = new MikroLedgerRepository();

async function seedWallet(initial = '100.00'): Promise<Wallet> {
  const wallet = Wallet.open({
    id: randomUUID(),
    playerId: randomUUID(),
    initialBalance: brl(initial),
    now: new Date(),
  });
  await uow.run((tx) => wallets.insert(tx, wallet));
  return wallet;
}

function newBet(wallet: Wallet, external = 'tx-1', amount = '25.00'): WagerTransaction {
  const money = brl(amount);
  return WagerTransaction.create({
    id: randomUUID(),
    providerId: 'provider-a',
    externalTransactionId: external,
    idempotencyKey: `provider-a:${external}`,
    payloadHash: computePayloadHash({
      providerId: 'provider-a',
      externalTransactionId: external,
      playerId: wallet.playerId,
      walletId: wallet.id,
      roundId: 'r1',
      gameId: 'g1',
      kind: Kind.Bet,
      money,
    }),
    walletId: wallet.id,
    playerId: wallet.playerId,
    roundId: 'r1',
    gameId: 'g1',
    kind: Kind.Bet,
    money,
    referenceExternalTransactionId: undefined,
    now: new Date(),
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

describe('idempotência persistente (PostgreSQL real)', () => {
  test('a mesma transação enviada 50 vezes em paralelo gera um único registro', async () => {
    const wallet = await seedWallet();

    // 50 objetos distintos (ids diferentes), todos com a mesma idempotency key.
    const results = await Promise.all(
      Array.from({ length: 50 }, () => uow.run((tx) => txs.insertIfAbsent(tx, newBet(wallet)))),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    const rows = await orm.em.execute<Array<{ c: string }>>(
      'select count(*) as c from wager_transactions where provider_id = ? and idempotency_key = ?',
      ['provider-a', 'provider-a:tx-1'],
    );
    expect(Number(rows[0]!.c)).toBe(1);
  });

  test('mesma transação externa com outra idempotency key também é barrada', async () => {
    const wallet = await seedWallet();
    const first = newBet(wallet);
    const second = WagerTransaction.create({
      ...{ id: randomUUID(), providerId: 'provider-a', externalTransactionId: 'tx-1' },
      idempotencyKey: 'provider-a:outra-chave',
      payloadHash: first.payloadHash,
      walletId: wallet.id,
      playerId: wallet.playerId,
      roundId: 'r1',
      gameId: 'g1',
      kind: Kind.Bet,
      money: brl('25.00'),
      referenceExternalTransactionId: undefined,
      now: new Date(),
    });

    expect(await uow.run((tx) => txs.insertIfAbsent(tx, first))).toBe(true);
    expect(await uow.run((tx) => txs.insertIfAbsent(tx, second))).toBe(false);
  });

  test('ida e volta: o que foi gravado é o que é lido', async () => {
    const wallet = await seedWallet();
    const bet = newBet(wallet);
    await uow.run((tx) => txs.insertIfAbsent(tx, bet));

    const loaded = await uow.run((tx) => txs.findByIdempotencyKey(tx, 'provider-a', 'provider-a:tx-1'));
    expect(loaded?.id).toBe(bet.id);
    expect(loaded?.status).toBe(Status.Pending);
    expect(loaded?.money.amount).toBe('25.00');
    expect(loaded?.payloadHash).toBe(bet.payloadHash);
    expect(loaded?.matchesPayload(bet.payloadHash)).toBe(true);

    const byExternal = await uow.run((tx) => txs.findByExternalId(tx, 'provider-a', 'tx-1'));
    expect(byExternal?.id).toBe(bet.id);
  });

  test('update persiste a transição e guarda o saldo observado (base do replay)', async () => {
    const wallet = await seedWallet();
    const bet = newBet(wallet);
    await uow.run((tx) => txs.insertIfAbsent(tx, bet));

    const at = new Date('2026-10-25T10:00:00.000Z');
    bet.markProcessed(undefined, at, brl('75.00'));
    await uow.run((tx) => txs.update(tx, bet));

    const loaded = await uow.run((tx) => txs.findById(tx, bet.id));
    expect(loaded?.status).toBe(Status.Processed);
    expect(loaded?.balanceObserved?.amount).toBe('75.00');
    expect(loaded?.processedAt).toEqual(at);
  });
});

describe('ledger (PostgreSQL real)', () => {
  test('lançamento duplicado por (wallet, transação) é barrado pelo banco', async () => {
    const wallet = await seedWallet();
    const bet = newBet(wallet);
    const debit = wallet.debit({ entryId: randomUUID(), transactionId: bet.id, money: bet.money, at: new Date() });
    const extra = wallet.credit({ entryId: randomUUID(), transactionId: bet.id, money: brl('1.00'), at: new Date() });

    await uow.run(async (tx) => {
      await txs.insertIfAbsent(tx, bet);
      await ledger.insert(tx, debit);
    });

    await expect(uow.run((tx) => ledger.insert(tx, extra))).rejects.toThrow(/uq_ledger_wallet_transaction/);
  });

  test('UPDATE e DELETE no ledger são proibidos pelo banco (imutabilidade)', async () => {
    const wallet = await seedWallet();
    const bet = newBet(wallet);
    const debit = wallet.debit({ entryId: randomUUID(), transactionId: bet.id, money: bet.money, at: new Date() });
    await uow.run(async (tx) => {
      await txs.insertIfAbsent(tx, bet);
      await ledger.insert(tx, debit);
    });

    await expect(
      orm.em.execute('update wallet_ledger_entries set amount = amount where id = ?', [debit.id], 'run'),
    ).rejects.toThrow(/immutable/);
    await expect(
      orm.em.execute('delete from wallet_ledger_entries where id = ?', [debit.id], 'run'),
    ).rejects.toThrow(/immutable/);
  });

  test('invariante: saldo da wallet == créditos - débitos do ledger', async () => {
    const wallet = await seedWallet('100.00');

    const opening = WagerTransaction.createOpening({
      id: randomUUID(),
      walletId: wallet.id,
      playerId: wallet.playerId,
      money: brl('100.00'),
      payloadHash: createHash('sha256').update('opening').digest('hex'),
      now: new Date(),
    });
    const openingEntry = wallet.openingEntry({ entryId: randomUUID(), transactionId: opening.id })!;

    const bet = newBet(wallet);
    const betEntry = wallet.debit({ entryId: randomUUID(), transactionId: bet.id, money: bet.money, at: new Date() });

    await uow.run(async (tx) => {
      await txs.insertIfAbsent(tx, opening);
      await txs.insertIfAbsent(tx, bet);
      await ledger.insert(tx, openingEntry);
      await ledger.insert(tx, betEntry);
      await wallets.updateBalance(tx, wallet, 1);
    });

    const totals = await uow.run((tx) => ledger.totalsForWallet(tx, wallet.id, 'BRL'));
    const stored = await uow.run((tx) => wallets.findById(tx, wallet.id));

    expect(totals.entries).toBe(2);
    expect(totals.credits.amount).toBe('100.00');
    expect(totals.debits.amount).toBe('25.00');
    expect(totals.credits.subtract(totals.debits).equals(stored!.balance)).toBe(true);
  });
});