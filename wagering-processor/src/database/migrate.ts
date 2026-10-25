import { MikroORM } from '@mikro-orm/postgresql';
import config from '../../mikro-orm.config';

const command = process.argv[2] ?? 'up';

const orm = await MikroORM.init(config);
const migrator = orm.getMigrator();

if (command === 'up') {
  await migrator.up();
} else if (command === 'down') {
  await migrator.down(); // desfaz só a última
} else if (command === 'reset') {
  await migrator.down({ to: 0 }); // desfaz todas
} else {
  throw new Error(`Unknown command: ${command}`);
}

await orm.close();