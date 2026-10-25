import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { migrationsList } from './src/database/migrations';

export default defineConfig({
  clientUrl: process.env.DATABASE_URL,
  entities: [], // as entities do ORM entram numa etapa posterior
  discovery: { warnWhenNoEntities: false },
  extensions: [Migrator],
  migrations: {
    migrationsList,
    transactional: true, // cada migration roda dentro de uma transação
  },
});