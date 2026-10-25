import type { QueryResult } from '@mikro-orm/core';
import type { TransactionContext } from '../../../../shared/application/unit-of-work.port';
import { emOf } from '../../../../shared/infrastructure/persistence/mikro-unit-of-work';
import type { WalletRepository } from '../../domain/ports/wallet.repository';
import type { Wallet } from '../../domain/wallet';
import { ConcurrentWalletModificationError } from '../../domain/wallet.errors';
import { WALLET_COLUMNS, walletFromRow, type WalletRow } from './wallet.mapper';

export class MikroWalletRepository implements WalletRepository {
  async insert(tx: TransactionContext, wallet: Wallet): Promise<void> {
    await emOf(tx).execute(
      `insert into wallets (id, player_id, currency, balance, version, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?)`,
      [
        wallet.id,
        wallet.playerId,
        wallet.currency,
        wallet.balance.amount,
        wallet.version,
        wallet.createdAt,
        wallet.updatedAt,
      ],
      'run',
    );
  }

  async findById(tx: TransactionContext, id: string): Promise<Wallet | undefined> {
    const rows = await emOf(tx).execute<WalletRow[]>(`select ${WALLET_COLUMNS} from wallets where id = ?`, [id]);
    return rows[0] ? walletFromRow(rows[0]) : undefined;
  }

  async findByIdForUpdate(tx: TransactionContext, id: string): Promise<Wallet | undefined> {
    const rows = await emOf(tx).execute<WalletRow[]>(
      `select ${WALLET_COLUMNS} from wallets where id = ? for update`,
      [id],
    );
    return rows[0] ? walletFromRow(rows[0]) : undefined;
  }

  async updateBalance(tx: TransactionContext, wallet: Wallet, expectedVersion: number): Promise<void> {
    const result = await emOf(tx).execute<QueryResult>(
      `update wallets set balance = ?, version = ?, updated_at = ? where id = ? and version = ?`,
      [wallet.balance.amount, wallet.version, wallet.updatedAt, wallet.id, expectedVersion],
      'run',
    );
    if (result.affectedRows !== 1) {
      throw new ConcurrentWalletModificationError(wallet.id);
    }
  }
}