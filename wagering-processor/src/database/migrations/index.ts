import { Migration20261101000001_create_wallets } from './Migration20261101000001_create_wallets';
import { Migration20261101000002_create_wager_transactions } from './Migration20261101000002_create_wager_transactions';
import { Migration20261101000003_create_wallet_ledger_entries } from './Migration20261101000003_create_wallet_ledger_entries';
import { Migration20261101000004_ledger_immutability_trigger } from './Migration20261101000004_ledger_immutability_trigger';
import { Migration20261101000005_create_inbox_messages } from './Migration20261101000005_create_inbox_messages';
import { Migration20261101000006_create_outbox_messages } from './Migration20261101000006_create_outbox_messages';

export const migrationsList = [
  { name: 'Migration20261101000001_create_wallets', class: Migration20261101000001_create_wallets },
  { name: 'Migration20261101000002_create_wager_transactions', class: Migration20261101000002_create_wager_transactions },
  { name: 'Migration20261101000003_create_wallet_ledger_entries', class: Migration20261101000003_create_wallet_ledger_entries },
  { name: 'Migration20261101000004_ledger_immutability_trigger', class: Migration20261101000004_ledger_immutability_trigger },
  { name: 'Migration20261101000005_create_inbox_messages', class: Migration20261101000005_create_inbox_messages },
  { name: 'Migration20261101000006_create_outbox_messages', class: Migration20261101000006_create_outbox_messages },
];