import { Migration } from '@mikro-orm/migrations';

export class Migration20261101000004_ledger_immutability_trigger extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE FUNCTION forbid_ledger_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'wallet_ledger_entries is immutable (% not allowed)', TG_OP;
      END;
      $$ LANGUAGE plpgsql;
    `);
    this.addSql(`
      CREATE TRIGGER trg_ledger_immutable
        BEFORE UPDATE OR DELETE ON wallet_ledger_entries
        FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TRIGGER IF EXISTS trg_ledger_immutable ON wallet_ledger_entries;`);
    this.addSql(`DROP FUNCTION IF EXISTS forbid_ledger_mutation();`);
  }
}