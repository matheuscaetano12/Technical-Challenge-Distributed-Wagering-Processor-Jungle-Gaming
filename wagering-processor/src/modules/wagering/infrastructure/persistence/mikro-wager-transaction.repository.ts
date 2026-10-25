import type { QueryResult } from '@mikro-orm/core';
import type { TransactionContext } from '../../../../shared/application/unit-of-work.port';
import { emOf } from '../../../../shared/infrastructure/persistence/mikro-unit-of-work';
import type { WagerTransactionRepository } from '../../domain/ports/wager-transaction.repository';
import type { WagerTransaction } from '../../domain/wager-transaction';
import { InvalidTransactionStateError } from '../../domain/wager.errors';
import {
  WAGER_TRANSACTION_COLUMNS,
  wagerTransactionFromRow,
  type WagerTransactionRow,
} from './wager-transaction.mapper';

export class MikroWagerTransactionRepository implements WagerTransactionRepository {
  async insertIfAbsent(tx: TransactionContext, t: WagerTransaction): Promise<boolean> {
    // Sem alvo no ON CONFLICT: cobre as duas unicidades (provider+idempotency_key e provider+external_id).
    // Sob concorrência, a 2ª transação espera a 1ª terminar e então não insere nada.
    const result = await emOf(tx).execute<QueryResult>(
      `insert into wager_transactions (
         id, provider_id, external_transaction_id, idempotency_key, payload_hash, wallet_id, player_id,
         round_id, game_id, kind, amount, currency, reference_external_transaction_id,
         reference_transaction_id, status, failure_code, balance_observed, created_at, processed_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict do nothing`,
      [
        t.id,
        t.providerId,
        t.externalTransactionId,
        t.idempotencyKey,
        t.payloadHash,
        t.walletId,
        t.playerId,
        t.roundId,
        t.gameId,
        t.kind,
        t.money.amount,
        t.money.currency,
        t.referenceExternalTransactionId ?? null,
        t.referenceTransactionId ?? null,
        t.status,
        t.failureCode ?? null,
        t.balanceObserved?.amount ?? null,
        t.createdAt,
        t.processedAt ?? null,
      ],
      'run',
    );
    return result.affectedRows === 1;
  }

  async findById(tx: TransactionContext, id: string): Promise<WagerTransaction | undefined> {
    return this.findOne(tx, 'id = ?', [id]);
  }

  async findByIdempotencyKey(tx: TransactionContext, providerId: string, key: string) {
    return this.findOne(tx, 'provider_id = ? and idempotency_key = ?', [providerId, key]);
  }

  async findByExternalId(tx: TransactionContext, providerId: string, externalId: string) {
    return this.findOne(tx, 'provider_id = ? and external_transaction_id = ?', [providerId, externalId]);
  }

  async update(tx: TransactionContext, t: WagerTransaction): Promise<void> {
    // O WHERE status IN (...) é uma segunda barreira: estado terminal nunca é reescrito no banco.
    const result = await emOf(tx).execute<QueryResult>(
      `update wager_transactions
         set status = ?, failure_code = ?, reference_transaction_id = ?, balance_observed = ?, processed_at = ?
       where id = ? and status in ('PENDING', 'PENDING_REFERENCE')`,
      [
        t.status,
        t.failureCode ?? null,
        t.referenceTransactionId ?? null,
        t.balanceObserved?.amount ?? null,
        t.processedAt ?? null,
        t.id,
      ],
      'run',
    );
    if (result.affectedRows !== 1) {
      throw new InvalidTransactionStateError('TERMINAL_OR_MISSING', t.status);
    }
  }

  async existsProcessedReversalOf(tx: TransactionContext, referenceTransactionId: string): Promise<boolean> {
    const rows = await emOf(tx).execute<unknown[]>(
      `select 1 from wager_transactions
        where reference_transaction_id = ? and kind in ('REFUND', 'ROLLBACK') and status = 'PROCESSED'
        limit 1`,
      [referenceTransactionId],
    );
    return rows.length > 0;
  }

  private async findOne(tx: TransactionContext, where: string, params: unknown[]) {
    const rows = await emOf(tx).execute<WagerTransactionRow[]>(
      `select ${WAGER_TRANSACTION_COLUMNS} from wager_transactions where ${where}`,
      params,
    );
    return rows[0] ? wagerTransactionFromRow(rows[0]) : undefined;
  }
}