import { IntegrationEvent, type EventContext } from '../../../../shared/domain/integration-event';
import type { WagerTransaction } from '../wager-transaction';
import { InvalidWagerTransactionError } from '../wager.errors';

export interface WagerTransactionPendingReferenceData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  kind: string;
  referenceExternalTransactionId: string;
}

export class WagerTransactionPendingReference extends IntegrationEvent<WagerTransactionPendingReferenceData> {
  readonly eventType = 'WagerTransactionPendingReference';
  readonly version = 1;

  static from(t: WagerTransaction, ctx: EventContext): WagerTransactionPendingReference {
    if (!t.referenceExternalTransactionId) {
      throw new InvalidWagerTransactionError('Only transactions with a reference can be pending a reference');
    }
    return new WagerTransactionPendingReference({
      ...ctx,
      aggregateId: t.walletId,
      data: {
        transactionId: t.id,
        providerId: t.providerId,
        externalTransactionId: t.externalTransactionId,
        walletId: t.walletId,
        kind: t.kind,
        referenceExternalTransactionId: t.referenceExternalTransactionId,
      },
    });
  }
}