import { randomUUID } from 'node:crypto';
import { Money } from '../../src/shared/domain/money/money';
import { computePayloadHash } from '../../src/shared/infrastructure/hashing/payload-hash';
import { Wallet } from '../../src/modules/wallet/domain/wallet';
import { WagerTransaction } from '../../src/modules/wagering/domain/wager-transaction';
import { WagerTransactionKind as Kind } from '../../src/modules/wagering/domain/wager-transaction-kind';

export const brl = (amount: string) => Money.from({ amount, currency: 'BRL' });

/** Wallet em memória (ainda não persistida). */
export function openWallet(initial = '100.00'): Wallet {
  return Wallet.open({ id: randomUUID(), playerId: randomUUID(), initialBalance: brl(initial), now: new Date() });
}

export function newBet(wallet: Wallet, external = 'tx-1', amount = '25.00'): WagerTransaction {
  const money = brl(amount);
  return WagerTransaction.create({
    id: randomUUID(),
    providerId: 'provider-a',
    externalTransactionId: external,
    idempotencyKey: `provider-a:${external}`,
    payloadHash: computePayloadHash({
      providerId: 'provider-a',
      externalTransactionId: external,
      playerId: wallet.playerId,
      walletId: wallet.id,
      roundId: 'r1',
      gameId: 'g1',
      kind: Kind.Bet,
      money,
    }),
    walletId: wallet.id,
    playerId: wallet.playerId,
    roundId: 'r1',
    gameId: 'g1',
    kind: Kind.Bet,
    money,
    referenceExternalTransactionId: undefined,
    now: new Date(),
  });
}