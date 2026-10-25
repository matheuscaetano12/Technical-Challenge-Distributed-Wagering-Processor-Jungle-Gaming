import { Migration } from '@mikro-orm/migrations';

export class Migration20261101000005_create_inbox_messages extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE inbox_messages (
        consumer_name TEXT NOT NULL,
        message_id    TEXT NOT NULL,
        payload_hash  CHAR(64) NOT NULL,
        received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        processed_at  TIMESTAMPTZ,
        PRIMARY KEY (consumer_name, message_id)
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS inbox_messages;`);
  }
}