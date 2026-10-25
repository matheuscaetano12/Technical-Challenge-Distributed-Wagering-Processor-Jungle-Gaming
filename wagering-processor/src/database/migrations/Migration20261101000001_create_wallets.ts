import { Migration } from '@mikro-orm/migrations';

export class Migration20261101000001_create_wallets extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE wallets (
        id          UUID PRIMARY KEY,
        player_id   UUID NOT NULL,
        currency    CHAR(3) NOT NULL,
        balance     NUMERIC(19,2) NOT NULL,
        version     INTEGER NOT NULL DEFAULT 1,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT ck_wallets_balance_non_negative CHECK (balance >= 0),
        CONSTRAINT ck_wallets_version_positive CHECK (version >= 1),
        CONSTRAINT uq_wallets_player_currency UNIQUE (player_id, currency)
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS wallets;`);
  }
}