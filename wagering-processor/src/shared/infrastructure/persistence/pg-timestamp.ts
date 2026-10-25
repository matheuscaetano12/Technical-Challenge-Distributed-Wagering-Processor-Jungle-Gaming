/**
 * O driver devolve timestamptz como texto no formato do Postgres ("2026-10-25 07:00:00.123-03").
 * Converte para Date sem depender do parser permissivo do engine.
 */
export function toDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  const iso = value
    .trim()
    .replace(' ', 'T')
    .replace(/([+-]\d{2})$/, '$1:00'); // "-03" vira "-03:00"
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp received from database: "${value}"`);
  }
  return date;
}