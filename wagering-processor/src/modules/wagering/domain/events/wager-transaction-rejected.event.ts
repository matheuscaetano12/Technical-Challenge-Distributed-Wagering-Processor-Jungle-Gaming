import { IntegrationEvent, type EventContext } from '../../../../shared/domain/integration-event';
import type { MoneyProps } from '../../../../shared/domain/money/money.props';
import type { WagerTransaction } from '../wager-transaction';
import { InvalidWagerTransactionError } from '../wager.errors';

export interface WagerTransactionRejectedData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  playerId: string;
  roundId: string;
  kind: string;
  money: MoneyProps;
  failureCode: string;
}

export class WagerTransactionRejected extends IntegrationEvent<WagerTransactionRejectedData> {
  readonly eventType = 'WagerTransactionRejected';
  readonly version = 1;

  static from(t: WagerTransaction, ctx: EventContext): WagerTransactionRejected {
    if (!t.failureCode) {
      throw new InvalidWagerTransactionError('A rejected transaction must carry a failure code');
    }
    return new WagerTransactionRejected({
      ...ctx,
      aggregateId: t.walletId,
      data: {
        transactionId: t.id,
        providerId: t.providerId,
        externalTransactionId: t.externalTransactionId,
        walletId: t.walletId,
        playerId: t.playerId,
        roundId: t.roundId,
        kind: t.kind,
        money: t.money.toJSON(),
        failureCode: t.failureCode,
      },
    });
  }
}