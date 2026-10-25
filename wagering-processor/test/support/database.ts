import { MikroORM } from '@mikro-orm/postgresql';
import config from '../../mikro-orm.config';
import { MikroUnitOfWork } from '../../src/shared/infrastructure/persistence/mikro-unit-of-work';

export async function connect() {
  const orm = await MikroORM.init(config);
  return { orm, uow: new MikroUnitOfWork(orm) };
}

export async function truncateAll(orm: MikroORM): Promise<void> {
  await orm.em.execute(
    'truncate table wallet_ledger_entries, wager_transactions, wallets, inbox_messages, outbox_messages cascade',
  );
}

export async function countRows(orm: MikroORM, table: string): Promise<number> {
  const rows = await orm.em.execute<Array<{ c: string }>>(`select count(*) as c from ${table}`);
  return Number(rows[0]!.c);
}