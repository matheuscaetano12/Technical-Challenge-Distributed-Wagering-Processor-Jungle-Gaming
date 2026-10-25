import { describe, expect, test } from 'bun:test';
import { Money } from '../../../src/shared/domain/money/money';
import { canonicalJson } from '../../../src/shared/infrastructure/hashing/canonical-json';
import { computePayloadHash, type HashablePayload } from '../../../src/shared/infrastructure/hashing/payload-hash';

const base = (over: Partial<HashablePayload> = {}): HashablePayload => ({
  providerId: 'provider-a',
  externalTransactionId: 'transaction-123',
  playerId: 'p1',
  walletId: 'w1',
  roundId: 'round-987',
  gameId: 'fortune-chimp',
  kind: 'BET',
  money: Money.from({ amount: '25.00', currency: 'BRL' }),
  ...over,
});

describe('canonicalJson', () => {
  test('ordena chaves recursivamente e não usa espaços', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  test('omite undefined em objetos e preserva ordem de arrays', () => {
    expect(canonicalJson({ a: undefined, b: [3, 1, 2] })).toBe('{"b":[3,1,2]}');
  });

  test('rejeita número não finito', () => {
    expect(() => canonicalJson({ a: Infinity })).toThrow();
  });
});

describe('computePayloadHash', () => {
  test('tem 64 caracteres hexadecimais e é determinístico', () => {
    const h = computePayloadHash(base());
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(computePayloadHash(base())).toBe(h);
  });

  test('valores equivalentes ("25" e "25.00") geram o mesmo hash', () => {
    const a = computePayloadHash(base({ money: Money.from({ amount: '25', currency: 'BRL' }) }));
    expect(a).toBe(computePayloadHash(base()));
  });

  test.each([
    ['valor', { money: Money.from({ amount: '25.01', currency: 'BRL' }) }],
    ['moeda', { money: Money.from({ amount: '25.00', currency: 'USD' }) }],
    ['kind', { kind: 'WIN' }],
    ['rodada', { roundId: 'round-988' }],
    ['jogo', { gameId: 'other' }],
    ['wallet', { walletId: 'w2' }],
    ['player', { playerId: 'p2' }],
    ['provider', { providerId: 'provider-b' }],
    ['transação externa', { externalTransactionId: 'transaction-124' }],
    ['referência', { referenceExternalTransactionId: 'transaction-1' }],
  ] as const)('mudar %s muda o hash', (_name, over) => {
    expect(computePayloadHash(base(over))).not.toBe(computePayloadHash(base()));
  });
});