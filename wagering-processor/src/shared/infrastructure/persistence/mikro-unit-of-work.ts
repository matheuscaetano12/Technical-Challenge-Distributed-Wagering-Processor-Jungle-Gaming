import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import type { TransactionContext, UnitOfWork } from '../../application/unit-of-work.port';

export class MikroTransactionContext implements TransactionContext {
  readonly kind = 'transaction-context' as const;
  constructor(readonly em: EntityManager) {}
}

export function emOf(tx: TransactionContext): EntityManager {
  if (!(tx instanceof MikroTransactionContext)) {
    throw new Error('Unsupported transaction context');
  }
  return tx.em;
}

export class MikroUnitOfWork implements UnitOfWork {
  constructor(private readonly orm: MikroORM) {}

  run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    // fork(): cada transação tem seu próprio EntityManager (nada compartilhado entre requisições).
    // Isolamento padrão READ COMMITTED: um SELECT ... FOR UPDATE relê a versão mais recente da linha
    // depois de esperar o lock, e é isso que torna a corrida segura.
    return this.orm.em.fork().transactional((em) => work(new MikroTransactionContext(em as EntityManager)));
  }
}