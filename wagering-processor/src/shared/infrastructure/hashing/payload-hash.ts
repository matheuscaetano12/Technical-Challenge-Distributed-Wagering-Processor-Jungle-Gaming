import { createHash } from 'node:crypto';
import type { Money } from '../../domain/money/money';
import { canonicalJson } from './canonical-json';

/**
 * Campos de negócio que entram no hash. O header Idempotency-Key, o idempotencyKey da mensagem
 * e qualquer metadado de transporte NÃO entram.
 */
export interface HashablePayload {
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: string;
  money: Money;
  referenceExternalTransactionId?: string;
}

/** SHA-256 (hex, 64 caracteres) do JSON canônico do subconjunto de negócio. */
export function computePayloadHash(payload: HashablePayload): string {
  const canonical = canonicalJson({
    providerId: payload.providerId,
    externalTransactionId: payload.externalTransactionId,
    playerId: payload.playerId,
    walletId: payload.walletId,
    roundId: payload.roundId,
    gameId: payload.gameId,
    kind: payload.kind,
    money: payload.money.toJSON(), // valor normalizado: "25" e "25.00" geram o mesmo hash
    referenceExternalTransactionId: payload.referenceExternalTransactionId,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}