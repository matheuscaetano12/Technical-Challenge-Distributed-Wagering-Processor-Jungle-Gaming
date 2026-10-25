import { Migration } from '@mikro-orm/migrations';

export class Migration20261101000006_create_outbox_messages extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE outbox_messages (
        id              UUID PRIMARY KEY,
        aggregate_id    UUID NOT NULL,
        event_type      TEXT NOT NULL,
        payload         JSONB NOT NULL,
        occurred_at     TIMESTAMPTZ NOT NULL,
        attempts        INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMPTZ,
        published_at    TIMESTAMPTZ,
        CONSTRAINT ck_outbox_attempts_non_negative CHECK (attempts >= 0)
      );
    `);

    // O publisher só olha o que ainda não foi publicado.
    this.addSql(`
      CREATE INDEX ix_outbox_pending
        ON outbox_messages (next_attempt_at NULLS FIRST, occurred_at)
        WHERE published_at IS NULL;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS outbox_messages;`);
  }
}