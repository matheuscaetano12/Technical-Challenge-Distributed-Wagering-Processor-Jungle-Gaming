/** Contexto opaco de uma transação SQL em andamento. */
export interface TransactionContext {
  readonly kind: 'transaction-context';
}

export interface UnitOfWork {
  /** Executa tudo numa única transação: commit se resolver, rollback se lançar. */
  run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>;
}