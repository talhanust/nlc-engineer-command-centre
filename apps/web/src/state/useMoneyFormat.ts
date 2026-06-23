import { useSyncExternalStore } from 'react';
import { getMoneyFormat, subscribeMoneyFormat, type MoneyFormat } from '../domain/money';

/** Re-renders the component whenever the currency unit changes in Settings. */
export function useMoneyFormat(): MoneyFormat {
  return useSyncExternalStore(subscribeMoneyFormat, getMoneyFormat, getMoneyFormat);
}
