import { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Select } from '@actual-app/components/select';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import { q } from '@actual-app/core/shared/query';
import type {
  AccountEntity,
  CategoryEntity,
  TransactionEntity,
} from '@actual-app/core/types/models';

import { Link } from '#components/common/Link';
import { Checkbox } from '#components/forms';
import { Page } from '#components/Page';
import { useAccounts } from '#hooks/useAccounts';
import { useCategories } from '#hooks/useCategories';
import { useFormat } from '#hooks/useFormat';
import { useSheetValue } from '#hooks/useSheetValue';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { aqlQuery } from '#queries/aqlQuery';
import * as bindings from '#spreadsheet/bindings';

import type { AccountCategoryMap, AccountGroup } from '../accounts/accountClassification';
import { classifyAccount } from '../accounts/accountClassification';

type OverviewTransaction = TransactionEntity & {
  category?: CategoryEntity['id'] | null;
};

type CategorySpend = {
  id: string;
  name: string;
  amount: number;
};

type PayeeSpend = {
  payee: string;
  amount: number;
  count: number;
};

type AccountBalanceInfo = {
  ledger: number;
};

type TimeRangeId =
  | 'this-month'
  | 'last-month'
  | 'last-30-days'
  | 'last-90-days'
  | 'this-year';

type TimeRange = {
  startDate: string;
  endDate: string;
  label: string;
};

const TIME_RANGE_IDS: TimeRangeId[] = [
  'this-month',
  'last-month',
  'last-30-days',
  'last-90-days',
  'this-year',
];

function getTimeRangeLabel(id: TimeRangeId, t: (key: string) => string) {
  switch (id) {
    case 'this-month':
      return t('This month');
    case 'last-month':
      return t('Last month');
    case 'last-30-days':
      return t('Last 30 days');
    case 'last-90-days':
      return t('Last 90 days');
    case 'this-year':
      return t('This year');
  }
}

function getTimeRange(id: TimeRangeId, t: (key: string) => string): TimeRange {
  const currentDay = monthUtils.currentDay();
  const currentMonth = monthUtils.currentMonth();

  switch (id) {
    case 'this-month':
      return {
        startDate: monthUtils.firstDayOfMonth(currentMonth),
        endDate: currentDay,
        label: monthUtils.format(currentMonth, 'MMMM yyyy'),
      };
    case 'last-month': {
      const previousMonth = monthUtils.subMonths(currentMonth, 1);
      return {
        startDate: monthUtils.firstDayOfMonth(previousMonth),
        endDate: monthUtils.lastDayOfMonth(previousMonth),
        label: monthUtils.format(previousMonth, 'MMMM yyyy'),
      };
    }
    case 'last-30-days':
      return {
        startDate: monthUtils.subDays(currentDay, 29),
        endDate: currentDay,
        label: t('Last 30 days'),
      };
    case 'last-90-days':
      return {
        startDate: monthUtils.subDays(currentDay, 89),
        endDate: currentDay,
        label: t('Last 90 days'),
      };
    case 'this-year':
      return {
        startDate: `${currentMonth.slice(0, 4)}-01-01`,
        endDate: currentDay,
        label: t('This year'),
      };
  }
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: theme.tableBackground,
        border: `1px solid ${theme.tableBorder}`,
        borderRadius: 6,
        padding: 14,
        gap: 12,
        minHeight: 160,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: 600 }}>{title}</Text>
      {children}
    </View>
  );
}

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'good' | 'bad';
}) {
  return (
    <View
      style={{
        backgroundColor: theme.tableBackground,
        border: `1px solid ${theme.tableBorder}`,
        borderRadius: 6,
        padding: 14,
        gap: 6,
      }}
    >
      <Text style={{ color: theme.pageTextSubdued }}>{label}</Text>
      <Text
        style={{
          fontSize: 24,
          fontWeight: 650,
          color:
            tone === 'good'
              ? theme.noticeText
              : tone === 'bad'
                ? theme.errorText
                : theme.pageText,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function Row({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext?: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <View style={{ minWidth: 0, flex: 1 }}>
        <Text
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </Text>
        {subtext && (
          <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
            {subtext}
          </Text>
        )}
      </View>
      <Text style={{ fontWeight: 600, flexShrink: 0 }}>{value}</Text>
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  return <Text style={{ color: theme.pageTextSubdued }}>{text}</Text>;
}

function isTransferCategoryName(name: string) {
  const normalizedName = name.trim().toLowerCase();
  return (
    normalizedName.includes('transfer') ||
    normalizedName.includes('转账') ||
    normalizedName.includes('转帐') ||
    normalizedName.includes('轉帳')
  );
}

export function FinanceOverview() {
  const { t } = useTranslation();
  const format = useFormat();
  const { data: accounts = [] } = useAccounts();
  const {
    data: { grouped: categoryGroups = [], list: categories = [] } = {
      grouped: [],
      list: [],
    },
  } = useCategories();
  const allAccountsBalance = useSheetValue<'account', 'accounts-balance'>(
    bindings.allAccountBalance(),
  );
  const [accountCategoryPref] = useSyncedPref(
    'custom-sync-mappings-account-category',
  );
  const [transactions, setTransactions] = useState<OverviewTransaction[]>([]);
  const [accountBalances, setAccountBalances] = useState<
    Record<string, AccountBalanceInfo>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [timeRangeId, setTimeRangeId] = useState<TimeRangeId>('this-month');
  const [hideTransfers, setHideTransfers] = useState(true);

  const timeRangeOptions = useMemo(
    () =>
      TIME_RANGE_IDS.map(
        id => [id, getTimeRangeLabel(id, t)] as const,
      ),
    [t],
  );
  const timeRange = useMemo(
    () => getTimeRange(timeRangeId, t),
    [timeRangeId, t],
  );
  const { startDate, endDate } = timeRange;

  useEffect(() => {
    let isMounted = true;

    async function loadTransactions() {
      setIsLoading(true);
      const result = await aqlQuery(
        q('transactions')
          .filter({ date: { $gte: startDate } })
          .select('*'),
      );
      if (isMounted) {
        setTransactions((result.data ?? []) as OverviewTransaction[]);
        setIsLoading(false);
      }
    }

    void loadTransactions();
    return () => {
      isMounted = false;
    };
  }, [endDate, startDate]);

  useEffect(() => {
    let isMounted = true;

    async function loadAccountBalances() {
      const activeAccountIds = accounts
        .filter(account => !account.closed)
        .map(account => account.id);
      if (activeAccountIds.length === 0) {
        setAccountBalances({});
        return;
      }

      const result = await aqlQuery(
        q('transactions')
          .filter({ account: { $oneof: activeAccountIds } })
          .select(['account', 'amount', 'starting_balance_flag']),
      );

      const next: Record<string, AccountBalanceInfo> = {};
      for (const tx of (result.data ?? []) as OverviewTransaction[]) {
        const current = next[tx.account] ?? { ledger: 0 };
        current.ledger += tx.amount || 0;
        next[tx.account] = current;
      }

      if (isMounted) {
        setAccountBalances(next);
      }
    }

    void loadAccountBalances();
    return () => {
      isMounted = false;
    };
  }, [accounts]);

  const accountsById = useMemo(
    () => new Map(accounts.map(account => [account.id, account])),
    [accounts],
  );
  const categoriesById = useMemo(
    () => new Map(categories.map(category => [category.id, category])),
    [categories],
  );
  const categoryGroupsById = useMemo(
    () => new Map(categoryGroups.map(group => [group.id, group])),
    [categoryGroups],
  );
  const transferCategoryIds = useMemo(
    () =>
      new Set(
        categories
          .filter(category => {
            const groupName = categoryGroupsById.get(category.group)?.name;
            return (
              isTransferCategoryName(category.name) ||
              (groupName ? isTransferCategoryName(groupName) : false)
            );
          })
          .map(category => category.id),
      ),
    [categories, categoryGroupsById],
  );
  const accountCategoryOverrides = useMemo<AccountCategoryMap>(() => {
    if (!accountCategoryPref) return {};
    try {
      const parsed = JSON.parse(accountCategoryPref);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }, [accountCategoryPref]);

  const visibleTransactions = useMemo(
    () =>
      transactions.filter(transaction => {
        const account = accountsById.get(transaction.account);
        const isTransfer =
          !!transaction.transfer_id ||
          (transaction.category
            ? transferCategoryIds.has(transaction.category)
            : false);

        return (
          transaction.date <= endDate &&
          !transaction.is_parent &&
          !transaction.is_child &&
          !transaction.tombstone &&
          !transaction.starting_balance_flag &&
          (!hideTransfers || !isTransfer) &&
          account &&
          !account.closed &&
          !account.offbudget
        );
      }),
    [accountsById, endDate, hideTransfers, transactions, transferCategoryIds],
  );

  const unfilteredTransactions = useMemo(
    () =>
      transactions.filter(transaction => {
        const account = accountsById.get(transaction.account);
        return (
          transaction.date <= endDate &&
          !transaction.is_parent &&
          !transaction.is_child &&
          !transaction.tombstone &&
          !transaction.starting_balance_flag &&
          account &&
          !account.closed &&
          !account.offbudget
        );
      }),
    [accountsById, endDate, transactions],
  );

  const hiddenTransferCount = useMemo(
    () =>
      unfilteredTransactions.filter(
        transaction =>
          !!transaction.transfer_id ||
          (transaction.category
            ? transferCategoryIds.has(transaction.category)
            : false),
      ).length,
    [transferCategoryIds, unfilteredTransactions],
  );

  const spendingTransactions = visibleTransactions.filter(tx => tx.amount < 0);
  const incomeTransactions = visibleTransactions.filter(tx => tx.amount > 0);
  const totalSpending = spendingTransactions.reduce(
    (sum, tx) => sum + Math.abs(tx.amount),
    0,
  );
  const totalIncome = incomeTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  const uncategorizedSpending = spendingTransactions
    .filter(tx => !tx.category)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const topCategories = useMemo<CategorySpend[]>(() => {
    const totals = new Map<string, number>();
    for (const tx of spendingTransactions) {
      const id = tx.category || 'uncategorized';
      totals.set(id, (totals.get(id) ?? 0) + Math.abs(tx.amount));
    }
    return [...totals.entries()]
      .map(([id, amount]) => ({
        id,
        amount,
        name:
          id === 'uncategorized'
            ? t('Uncategorized')
            : categoriesById.get(id)?.name || t('Unknown category'),
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [categoriesById, spendingTransactions, t]);

  const uncategorizedPayees = useMemo<PayeeSpend[]>(() => {
    const totals = new Map<string, PayeeSpend>();
    for (const tx of spendingTransactions.filter(tx => !tx.category)) {
      const payee = tx.imported_payee || tx.payee || t('Unknown payee');
      const item = totals.get(payee) ?? { payee, amount: 0, count: 0 };
      item.amount += Math.abs(tx.amount);
      item.count += 1;
      totals.set(payee, item);
    }
    return [...totals.values()]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [spendingTransactions, t]);

  const groupedAccounts = useMemo(() => {
    const linked = accounts.filter(account => !account.closed);
    const ledgerBalance = (account: AccountEntity) =>
      accountBalances[account.id]?.ledger ?? 0;
    const sum = (group: AccountGroup) =>
      linked
        .filter(
          account => classifyAccount(account, accountCategoryOverrides) === group,
        )
        .reduce((total, account) => total + ledgerBalance(account), 0);
    const rows = [
      {
        label: t('Bank accounts'),
        value: sum('bank'),
      },
      {
        label: t('Credit cards'),
        value: sum('credit'),
      },
      {
        label: t('Investments'),
        value: sum('investment'),
      },
      {
        label: t('Other accounts'),
        value: sum('other'),
      },
    ];
    return {
      rows,
      total:
        typeof allAccountsBalance === 'number'
          ? allAccountsBalance
          : rows.reduce((total, row) => total + row.value, 0),
    };
  }, [
    accountBalances,
    accountCategoryOverrides,
    accounts,
    allAccountsBalance,
    t,
  ]);

  const largeTransactions = useMemo(
    () =>
      spendingTransactions
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
        .slice(0, 6),
    [spendingTransactions],
  );

  return (
    <Page header={t('Overview')}>
      <View style={{ gap: 18, paddingTop: 10, paddingBottom: 30 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <Text style={{ color: theme.pageTextSubdued }}>
              <Trans>Time range</Trans>
            </Text>
            <View style={{ width: 180 }}>
              <Select
                value={timeRangeId}
                options={timeRangeOptions}
                onChange={value => setTimeRangeId(value as TimeRangeId)}
              />
            </View>
            <Text style={{ color: theme.pageTextSubdued }}>
              {timeRange.label}
            </Text>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: theme.pageTextSubdued,
              }}
            >
              <Checkbox
                checked={hideTransfers}
                onChange={() => setHideTransfers(value => !value)}
              />
              <Trans>Hide transfers</Trans>
              {hideTransfers && hiddenTransferCount > 0 && (
                <Text style={{ color: theme.pageTextSubdued }}>
                  ({hiddenTransferCount})
                </Text>
              )}
            </label>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <Text style={{ color: theme.pageTextSubdued }}>
              {startDate} - {endDate}
            </Text>
            <Link variant="internal" to="/accounts/uncategorized">
              <Trans>Review uncategorized</Trans>
            </Link>
          </View>
        </View>

        <View
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: 12,
          }}
        >
          <Metric
            label={t('Spending')}
            value={format(totalSpending, 'financial')}
            tone="bad"
          />
          <Metric
            label={t('Income')}
            value={format(totalIncome, 'financial')}
            tone="good"
          />
          <Metric
            label={t('Uncategorized')}
            value={format(uncategorizedSpending, 'financial')}
            tone={uncategorizedSpending > 0 ? 'bad' : 'default'}
          />
        </View>

        <View
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 12,
          }}
        >
          <Card title={t('Top spending categories')}>
            {isLoading ? (
              <EmptyState text={t('Loading...')} />
            ) : topCategories.length === 0 ? (
              <EmptyState text={t('No spending in this time range.')} />
            ) : (
              <View style={{ gap: 10 }}>
                {topCategories.map(item => (
                  <Row
                    key={item.id}
                    label={item.name}
                    value={format(item.amount, 'financial')}
                  />
                ))}
              </View>
            )}
          </Card>

          <Card title={t('Uncategorized queue')}>
            {isLoading ? (
              <EmptyState text={t('Loading...')} />
            ) : uncategorizedPayees.length === 0 ? (
              <EmptyState text={t('No uncategorized spending in this time range.')} />
            ) : (
              <View style={{ gap: 10 }}>
                {uncategorizedPayees.map(item => (
                  <Row
                    key={item.payee}
                    label={item.payee}
                    subtext={t('{{count}} transaction(s)', {
                      count: item.count,
                    })}
                    value={format(item.amount, 'financial')}
                  />
                ))}
              </View>
            )}
          </Card>

          <Card title={t('Account snapshot')}>
            <View style={{ gap: 10 }}>
              {groupedAccounts.rows.map(item => (
                <Row
                  key={item.label}
                  label={item.label}
                  value={format(item.value, 'financial')}
                />
              ))}
              <View
                style={{
                  borderTop: `1px solid ${theme.tableBorder}`,
                  paddingTop: 10,
                  marginTop: 2,
                }}
              >
                <Row
                  label={t('Total')}
                  value={format(groupedAccounts.total, 'financial')}
                />
              </View>
            </View>
          </Card>

          <Card title={t('Largest spending')}>
            {isLoading ? (
              <EmptyState text={t('Loading...')} />
            ) : largeTransactions.length === 0 ? (
              <EmptyState text={t('No spending in this time range.')} />
            ) : (
              <View style={{ gap: 10 }}>
                {largeTransactions.map(tx => (
                  <Row
                    key={tx.id}
                    label={tx.imported_payee || tx.payee || t('Unknown payee')}
                    subtext={tx.date}
                    value={format(Math.abs(tx.amount), 'financial')}
                  />
                ))}
              </View>
            )}
          </Card>
        </View>
      </View>
    </Page>
  );
}
