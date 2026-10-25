import { FailureCode } from './failure-code';
import type { WagerTransaction } from './wager-transaction';
import { WagerTransactionKind as Kind } from './wager-transaction-kind';
import { WagerTransactionStatus as Status } from './wager-transaction-status';
import { InvalidWagerTransactionError } from './wager.errors';

export type ReferenceDecision =
  | { readonly type: 'PROCEED' }
  | { readonly type: 'WAIT' }
  | { readonly type: 'REJECT'; readonly code: FailureCode };

const PROCEED: ReferenceDecision = { type: 'PROCEED' };
const WAIT: ReferenceDecision = { type: 'WAIT' };
const reject = (code: FailureCode): ReferenceDecision => ({ type: 'REJECT', code });

/** Tipos que cada operação de reversão pode referenciar. */
const REVERSIBLE_KINDS: Readonly<Record<Kind.Refund | Kind.Rollback, ReadonlySet<Kind>>> = {
  [Kind.Refund]: new Set([Kind.Bet]),
  [Kind.Rollback]: new Set([Kind.Bet, Kind.Win, Kind.Refund]),
};

export const ReferencePolicy = {
  /**
   * @param reversal         REFUND ou ROLLBACK a avaliar
   * @param reference        transação referenciada, já resolvida por (providerId, referenceExternalTransactionId); undefined se não existe
   * @param alreadyReversed  true se a referência já foi revertida por um REFUND/ROLLBACK PROCESSED
   */
  evaluate(
    reversal: WagerTransaction,
    reference: WagerTransaction | undefined,
    alreadyReversed: boolean,
  ): ReferenceDecision {
    if (!reversal.requiresReference()) {
      throw new InvalidWagerTransactionError(`${reversal.kind} does not take a reference`);
    }

    // 1. Referência ausente ou ainda em andamento: aguardar.
    if (!reference) return WAIT;
    if (reference.status === Status.Pending || reference.status === Status.PendingReference) return WAIT;

    // 2. Referência terminou sem efeito (REJECTED/FAILED): nada a reverter.
    if (reference.status !== Status.Processed) return reject(FailureCode.ReferenceNotProcessed);

    // 3. Contexto: mesmo provider, player, wallet, moeda e rodada.
    if (reference.providerId !== reversal.providerId) return reject(FailureCode.ReferenceMismatch);
    if (reference.playerId !== reversal.playerId) return reject(FailureCode.PlayerMismatch);
    if (reference.walletId !== reversal.walletId) return reject(FailureCode.ReferenceMismatch);
    if (reference.money.currency !== reversal.money.currency) return reject(FailureCode.CurrencyMismatch);
    if (reference.roundId !== reversal.roundId) return reject(FailureCode.ReferenceMismatch);

    // 4. Tipo permitido (REFUND só BET; ROLLBACK BET, WIN ou REFUND).
    const allowed = REVERSIBLE_KINDS[reversal.kind as Kind.Refund | Kind.Rollback];
    if (!allowed.has(reference.kind)) return reject(FailureCode.InvalidReferenceKind);

    // 5. Valor igual ao da referência (reversão parcial fora de escopo).
    if (!reference.money.equals(reversal.money)) return reject(FailureCode.AmountMismatch);

    // 6. Reversão única.
    if (alreadyReversed) return reject(FailureCode.AlreadyReversed);

    return PROCEED;
  },
} as const;