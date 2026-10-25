import { Money } from '../../../../shared/domain/money/money';
import { toDate } from '../../../../shared/infrastructure/persistence/pg-timestamp';
import { Wallet } from '../../domain/wallet';

export interface WalletRow {
  id: string;
  player_id: string;
  currency: string;
  balance: string; // NUMERIC chega como string, sem perda de precisão
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
}

export const WALLET_COLUMNS = 'id, player_id, currency, balance, version, created_at, updated_at';

export function walletFromRow(row: WalletRow): Wallet {
  return Wallet.rehydrate({
    id: row.id,
    playerId: row.player_id,
    currency: row.currency,
    balance: Money.from({ amount: row.balance, currency: row.currency }),
    version: row.version,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  });
}