import type { AccountEntity } from '@actual-app/core/types/models';

export type AccountGroup = 'bank' | 'credit' | 'investment' | 'other';
export type AccountCategoryMap = Partial<Record<string, AccountGroup>>;

export function inferAccountGroup(account: AccountEntity): AccountGroup {
  const source = [
    account.name,
    account.official_name,
    account.bankName,
    account.bank,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    /(credit|amex|visa|mastercard|discover|card\b|platinum|hilton honors|bonvoy)/.test(
      source,
    )
  ) {
    return 'credit';
  }

  if (
    /(brokerage|invest|investment|ira|401k|roth|hsa|trading|stock|portfolio|wealth|retirement)/.test(
      source,
    )
  ) {
    return 'investment';
  }

  if (
    /(checking|savings|cash|bank|deposit|money market|cd\b|certificate of deposit)/.test(
      source,
    )
  ) {
    return 'bank';
  }

  return 'other';
}

export function classifyAccount(
  account: AccountEntity,
  categories: AccountCategoryMap,
): AccountGroup {
  return categories[account.id] ?? 'other';
}

export function fillMissingAccountCategories(
  accounts: AccountEntity[],
  categories: AccountCategoryMap,
): AccountCategoryMap {
  const next = { ...categories };
  for (const account of accounts) {
    if (account.id && !next[account.id]) {
      next[account.id] = inferAccountGroup(account);
    }
  }
  return next;
}
