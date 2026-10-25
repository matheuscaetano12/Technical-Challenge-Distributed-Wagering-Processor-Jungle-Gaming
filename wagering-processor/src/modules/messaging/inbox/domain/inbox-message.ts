import { DomainError } from '../../../../shared/domain/domain-error';

export class InvalidInboxStateError extends DomainError {
  readonly code = 'INVALID_INBOX_STATE';
  constructor(message: string) {
    super(message);
  }
}

export interface InboxMessageState {
  messageId: string;
  consumerName: string;
  payloadHash: string;
  receivedAt: Date;
  processedAt?: Date;
}

export interface ReceiveInboxProps {
  messageId: string;
  consumerName: string;
  payloadHash: string;
  now: Date;
}

export class InboxMessage {
  private constructor(
    public readonly messageId: string,
    public readonly consumerName: string,
    public readonly payloadHash: string,
    public readonly receivedAt: Date,
    private _processedAt?: Date,
  ) {}

  static receive(props: ReceiveInboxProps): InboxMessage {
    return new InboxMessage(props.messageId, props.consumerName, props.payloadHash, props.now);
  }

  static rehydrate(s: InboxMessageState): InboxMessage {
    return new InboxMessage(s.messageId, s.consumerName, s.payloadHash, s.receivedAt, s.processedAt);
  }

  get processedAt(): Date | undefined {
    return this._processedAt;
  }

  isProcessed(): boolean {
    return this._processedAt !== undefined;
  }

  markProcessed(at: Date): void {
    if (this.isProcessed()) {
      throw new InvalidInboxStateError(`Inbox message ${this.consumerName}/${this.messageId} is already processed`);
    }
    this._processedAt = at;
  }
}