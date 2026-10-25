import { Migration } from '@mikro-orm/migrations';

export class Migration20261101000003_create_wallet_ledger_entries extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE wallet_ledger_entries (
        id             UUID PRIMARY KEY,
        wallet_id      UUID NOT NULL REFERENCES wallets(id),
        transaction_id UUID NOT NULL REFERENCES wager_transactions(id),
        direction      TEXT NOT NULL,
        amount         NUMERIC(19,2) NOT NULL,
        balance_before NUMERIC(19,2) NOT NULL,
        balance_after  NUMERIC(19,2) NOT NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

        CONSTRAINT ck_ledger_direction CHECK (direction IN ('DEBIT','CREDIT')),
        CONSTRAINT ck_ledger_amount_positive CHECK (amount > 0),
        CONSTRAINT ck_ledger_balances_non_negative CHECK (balance_before >= 0 AND balance_after >= 0),
        CONSTRAINT ck_ledger_balanced CHECK (
          (direction = 'DEBIT'  AND balance_after = balance_before - amount) OR
          (direction = 'CREDIT' AND balance_after = balance_before + amount)
        ),
        -- no máximo um lançamento por wallet em cada transação financeira
        CONSTRAINT uq_ledger_wallet_transaction UNIQUE (wallet_id, transaction_id)
      );
    `);

    // Paginação por cursor estável: ordem total por (created_at, id).
    this.addSql(`
      CREATE INDEX ix_ledger_wallet_cursor
        ON wallet_ledger_entries (wallet_id, created_at, id);
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS wallet_ledger_entries;`);
  }
}