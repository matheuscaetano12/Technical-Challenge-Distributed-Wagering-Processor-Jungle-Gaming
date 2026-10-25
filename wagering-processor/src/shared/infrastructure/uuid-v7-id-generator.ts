import type { IdGenerator } from '../domain/id-generator.port';

/** UUID v7: ordenável no tempo, bom para índices e para ordenar o ledger. */
export class UuidV7IdGenerator implements IdGenerator {
  next(): string {
    return Bun.randomUUIDv7();
  }
}