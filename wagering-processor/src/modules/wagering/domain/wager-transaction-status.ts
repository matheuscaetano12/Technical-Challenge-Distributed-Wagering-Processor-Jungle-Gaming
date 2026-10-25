export enum WagerTransactionStatus {
  Pending = 'PENDING',
  PendingReference = 'PENDING_REFERENCE',
  Processed = 'PROCESSED', // terminal
  Rejected = 'REJECTED', // terminal
  Failed = 'FAILED', // terminal
}