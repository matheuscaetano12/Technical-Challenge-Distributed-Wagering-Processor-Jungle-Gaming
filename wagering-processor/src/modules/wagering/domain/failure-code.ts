export enum FailureCode {
  // REJECTED: regra de negócio
  InsufficientFunds = 'INSUFFICIENT_FUNDS',
  ReversalWouldOverdraw = 'REVERSAL_WOULD_OVERDRAW',
  ReferenceNotFound = 'REFERENCE_NOT_FOUND',
  ReferenceNotProcessed = 'REFERENCE_NOT_PROCESSED',
  ReferenceMismatch = 'REFERENCE_MISMATCH',
  InvalidReferenceKind = 'INVALID_REFERENCE_KIND',
  AlreadyReversed = 'ALREADY_REVERSED',
  AmountMismatch = 'AMOUNT_MISMATCH',
  CurrencyMismatch = 'CURRENCY_MISMATCH',
  WalletNotFound = 'WALLET_NOT_FOUND',
  PlayerMismatch = 'PLAYER_MISMATCH',
  // FAILED: erro permanente de infraestrutura
  InternalError = 'INTERNAL_ERROR',
}

/** O que o provedor deve fazer ao receber o código. */
export type ProviderAdvice = 'GIVE_UP' | 'FIX_PAYLOAD' | 'FIX_AND_RESEND_NEW_KEY' | 'CONTACT_SUPPORT';

export const FAILURE_CODE_ADVICE: Readonly<Record<FailureCode, ProviderAdvice>> = {
  [FailureCode.InsufficientFunds]: 'GIVE_UP',
  [FailureCode.ReversalWouldOverdraw]: 'CONTACT_SUPPORT',
  [FailureCode.ReferenceNotFound]: 'FIX_AND_RESEND_NEW_KEY',
  [FailureCode.ReferenceNotProcessed]: 'FIX_AND_RESEND_NEW_KEY',
  [FailureCode.ReferenceMismatch]: 'FIX_PAYLOAD',
  [FailureCode.InvalidReferenceKind]: 'FIX_PAYLOAD',
  [FailureCode.AlreadyReversed]: 'GIVE_UP',
  [FailureCode.AmountMismatch]: 'FIX_PAYLOAD',
  [FailureCode.CurrencyMismatch]: 'FIX_PAYLOAD',
  [FailureCode.WalletNotFound]: 'FIX_PAYLOAD',
  [FailureCode.PlayerMismatch]: 'FIX_PAYLOAD',
  [FailureCode.InternalError]: 'CONTACT_SUPPORT',
};