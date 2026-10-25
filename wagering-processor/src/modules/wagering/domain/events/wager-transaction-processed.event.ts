import { IntegrationEvent, type EventContext } from '../../../../shared/domain/integration-event';
import type { MoneyProps } from '../../../../shared/domain/money/money.props';
import type { WagerTransaction } from '../wager-transaction';
import { InvalidWagerTransactionError } from '../wager.errors';

export interface WagerTransactionProcessedData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: string;
  money: MoneyProps;
  /** Saldo da wallet no momento do processamento. */
  balance: MoneyProps;
}

export class WagerTransactionProcessed extends IntegrationEvent<WagerTransactionProcessedData> {
  readonly eventType = 'WagerTransactionProcessed';
  readonly version = 1;

  static from(t: WagerTransaction, ctx: EventContext): WagerTransactionProcessed {
    if (!t.balanceObserved) {
      throw new InvalidWagerTransactionError('A processed transaction must carry the observed balance');
    }
    return new WagerTransactionProcessed({
      ...ctx,
      aggregateId: t.walletId,
      data: {
        transactionId: t.id,
        providerId: t.providerId,
        externalTransactionId: t.externalTransactionId,
        walletId: t.walletId,
        playerId: t.playerId,
        roundId: t.roundId,
        gameId: t.gameId,
        kind: t.kind,
        money: t.money.toJSON(),
        balance: t.balanceObserved.toJSON(),
      },
    });
  }
}