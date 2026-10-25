import { Migration } from '@mikro-orm/migrations';

export class Migration20261101000002_create_wager_transactions extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE wager_transactions (
        id                                UUID PRIMARY KEY,
        provider_id                       TEXT NOT NULL,
        external_transaction_id           TEXT NOT NULL,
        idempotency_key                   TEXT NOT NULL,
        payload_hash                      CHAR(64) NOT NULL,
        wallet_id                         UUID NOT NULL REFERENCES wallets(id),
        player_id                         UUID NOT NULL,
        round_id                          TEXT NOT NULL,
        game_id                           TEXT NOT NULL,
        kind                              TEXT NOT NULL,
        amount                            NUMERIC(19,2) NOT NULL,
        currency                          CHAR(3) NOT NULL,
        reference_external_transaction_id TEXT,
        reference_transaction_id          UUID REFERENCES wager_transactions(id),
        status                            TEXT NOT NULL,
        failure_code                      TEXT,
        balance_observed                  NUMERIC(19,2),
        attempts                          INTEGER NOT NULL DEFAULT 0,
        next_attempt_at                   TIMESTAMPTZ,
        created_at                        TIMESTAMPTZ NOT NULL DEFAULT now(),
        processed_at                      TIMESTAMPTZ,

        CONSTRAINT ck_wtx_kind CHECK (kind IN ('OPENING','BET','WIN','LOSS','REFUND','ROLLBACK')),
        CONSTRAINT ck_wtx_status CHECK (status IN ('PENDING','PENDING_REFERENCE','PROCESSED','REJECTED','FAILED')),
        CONSTRAINT ck_wtx_amount_non_negative CHECK (amount >= 0),
        CONSTRAINT ck_wtx_attempts_non_negative CHECK (attempts >= 0),
        CONSTRAINT ck_wtx_reference_required
          CHECK ((kind IN ('REFUND','ROLLBACK')) = (reference_external_transaction_id IS NOT NULL)),
        CONSTRAINT ck_wtx_failure_code
          CHECK ((status IN ('REJECTED','FAILED')) = (failure_code IS NOT NULL)),
        CONSTRAINT ck_wtx_processed_at
          CHECK ((status = 'PROCESSED') = (processed_at IS NOT NULL)),

        CONSTRAINT uq_wtx_provider_idempotency UNIQUE (provider_id, idempotency_key),
        CONSTRAINT uq_wtx_provider_external UNIQUE (provider_id, external_transaction_id)
      );
    `);

    // Uma referência só pode ser revertida uma vez, por REFUND ou ROLLBACK (interpretação documentada).
    this.addSql(`
      CREATE UNIQUE INDEX uq_wtx_one_reversal_per_reference
        ON wager_transactions (reference_transaction_id)
        WHERE kind IN ('REFUND','ROLLBACK') AND status = 'PROCESSED';
    `);

    // Worker de PENDING_REFERENCE: busca só o que está vencido.
    this.addSql(`
      CREATE INDEX ix_wtx_pending_reference_due
        ON wager_transactions (next_attempt_at)
        WHERE status = 'PENDING_REFERENCE';
    `);

    this.addSql(`CREATE INDEX ix_wtx_wallet ON wager_transactions (wallet_id);`);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS wager_transactions;`);
  }
}