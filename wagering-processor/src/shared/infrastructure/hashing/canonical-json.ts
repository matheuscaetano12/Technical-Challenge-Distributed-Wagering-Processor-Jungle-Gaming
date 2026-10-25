/**
 * JSON canônico: chaves ordenadas recursivamente, sem espaços, `undefined` omitido em objetos.
 * O mesmo conteúdo lógico sempre gera exatamente a mesma string.
 */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('Cannot canonicalize a non-finite number');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}