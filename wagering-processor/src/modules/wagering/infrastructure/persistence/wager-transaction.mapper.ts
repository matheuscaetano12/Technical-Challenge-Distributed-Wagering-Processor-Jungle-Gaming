import { Money } from '../../../../shared/domain/money/money';
import { toDate } from '../../../../shared/infrastructure/persistence/pg-timestamp';
import type { FailureCode } from '../../domain/failure-code';
import { WagerTransaction } from '../../domain/wager-transaction';
import type { WagerTransactionKind } from '../../domain/wager-transaction-kind';
import type { WagerTransactionStatus } from '../../domain/wager-transaction-status';

export interface WagerTransactionRow {
  id: string;
  provider_id: string;
  external_transaction_id: string;
  idempotency_key: string;
  payload_hash: string;
  wallet_id: string;
  player_id: string;
  round_id: string;
  game_id: string;
  kind: string;
  amount: string;
  currency: string;
  reference_external_transaction_id: string | null;
  reference_transaction_id: string | null;
  status: string;
  failure_code: string | null;
  balance_observed: string | null;
  created_at: Date | string;
  processed_at: Date | string | null;
}

export const WAGER_TRANSACTION_COLUMNS = `id, provider_id, external_transaction_id, idempotency_key, payload_hash,
  wallet_id, player_id, round_id, game_id, kind, amount, currency, reference_external_transaction_id,
  reference_transaction_id, status, failure_code, balance_observed, created_at, processed_at`;

export function wagerTransactionFromRow(row: WagerTransactionRow): WagerTransaction {
  return WagerTransaction.rehydrate({
    id: row.id,
    providerId: row.provider_id,
    externalTransactionId: row.external_transaction_id,
    idempotencyKey: row.idempotency_key,
    payloadHash: row.payload_hash,
    walletId: row.wallet_id,
    playerId: row.player_id,
    roundId: row.round_id,
    gameId: row.game_id,
    kind: row.kind as WagerTransactionKind,
    money: Money.from({ amount: row.amount, currency: row.currency }),
    referenceExternalTransactionId: row.reference_external_transaction_id ?? undefined,
    createdAt: toDate(row.created_at),
    status: row.status as WagerTransactionStatus,
    referenceTransactionId: row.reference_transaction_id ?? undefined,
    failureCode: (row.failure_code as FailureCode | null) ?? undefined,
    processedAt: row.processed_at === null ? undefined : toDate(row.processed_at),
    balanceObserved:
      row.balance_observed === null ? undefined : Money.from({ amount: row.balance_observed, currency: row.currency }),
  });
}