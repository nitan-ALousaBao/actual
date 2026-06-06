import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { AccountEntity } from '@actual-app/core/types/models';

import { useMoveAccountMutation } from '#accounts';
import { useAccounts } from '#hooks/useAccounts';
import { useClosedAccounts } from '#hooks/useClosedAccounts';
import { useFailedAccounts } from '#hooks/useFailedAccounts';
import { useLocalPref } from '#hooks/useLocalPref';
import { useOffBudgetAccounts } from '#hooks/useOffBudgetAccounts';
import { useOnBudgetAccounts } from '#hooks/useOnBudgetAccounts';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { useUpdatedAccounts } from '#hooks/useUpdatedAccounts';
import { useSelector } from '#redux';
import * as bindings from '#spreadsheet/bindings';

import type { AccountCategoryMap, AccountGroup } from '../accounts/accountClassification';
import { classifyAccount } from '../accounts/accountClassification';
import { fillMissingAccountCategories } from '../accounts/accountClassification';
import { Account } from './Account';
import { SecondaryItem } from './SecondaryItem';

const fontWeight = 600;

function hasValidAccountId(account: AccountEntity): account is AccountEntity & {
  id: string;
} {
  return typeof account.id === 'string' && account.id.length > 0;
}

function institutionName(account: AccountEntity): string {
  return (
    account.bankName?.trim() ||
    account.bank?.trim() ||
    account.official_name?.trim() ||
    account.name?.trim() ||
    ''
  );
}

function sidebarAccountLabel(account: AccountEntity): string {
  const institution = institutionName(account);
  const accountName = (account.name ?? '').trim();

  if (!institution || institution === accountName) {
    return accountName;
  }

  return `${institution} - ${accountName}`;
}

function sortByInstitutionThenName(a: AccountEntity, b: AccountEntity): number {
  const instCompare = institutionName(a).localeCompare(institutionName(b), undefined, {
    sensitivity: 'base',
  });
  if (instCompare !== 0) return instCompare;
  return (a.name ?? '').localeCompare(b.name ?? '', undefined, {
    sensitivity: 'base',
  });
}

export function Accounts() {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const { data: accounts = [] } = useAccounts();
  const failedAccounts = useFailedAccounts();
  const updatedAccounts = useUpdatedAccounts();
  const { data: offbudgetAccounts = [] } = useOffBudgetAccounts();
  const { data: onBudgetAccounts = [] } = useOnBudgetAccounts();
  const { data: closedAccounts = [] } = useClosedAccounts();
  const syncingAccountIds = useSelector(state => state.account.accountsSyncing);
  const simpleFinAccounts = accounts.filter(
    account =>
      account.account_sync_source === 'simpleFin' &&
      !!account.bank &&
      !account.closed &&
      !account.tombstone,
  );

  const getAccountPath = (account: AccountEntity) => `/accounts/${account.id}`;

  const [showClosedAccounts, setShowClosedAccountsPref] = useLocalPref(
    'ui.showClosedAccounts',
  );
  const [accountCategoryPref, setAccountCategoryPref] = useSyncedPref(
    'custom-sync-mappings-account-category',
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

  useEffect(() => {
    const activeAccounts = accounts.filter(
      account => !account.closed && !account.tombstone,
    );
    const filled = fillMissingAccountCategories(
      activeAccounts,
      accountCategoryOverrides,
    );
    if (JSON.stringify(filled) !== JSON.stringify(accountCategoryOverrides)) {
      setAccountCategoryPref(JSON.stringify(filled));
    }
  }, [
    accountCategoryOverrides,
    accounts,
    setAccountCategoryPref,
  ]);

  function onDragChange(drag: { state: string }) {
    setIsDragging(drag.state === 'start');
  }

  const moveAccount = useMoveAccountMutation();

  const makeDropPadding = (i: number) => {
    if (i === 0) {
      return {
        paddingTop: isDragging ? 15 : 0,
        marginTop: isDragging ? -15 : 0,
      };
    }
    return undefined;
  };

  async function onReorder(
    id: string,
    dropPos: 'top' | 'bottom' | null,
    targetId: string,
  ) {
    let targetIdToMove: string | null = targetId;
    if (dropPos === 'bottom') {
      const idx = accounts.findIndex(a => a.id === targetId) + 1;
      targetIdToMove = idx < accounts.length ? accounts[idx].id : null;
    }

    moveAccount.mutate({ id, targetId: targetIdToMove });
  }

  const onToggleClosedAccounts = () => {
    setShowClosedAccountsPref(!showClosedAccounts);
  };

  function onSetAccountCategory(
    accountId: AccountEntity['id'],
    category: AccountGroup | null,
  ) {
    if (typeof accountId !== 'string' || accountId.length === 0) {
      return;
    }

    const next = { ...accountCategoryOverrides };
    if (category == null) {
      delete next[accountId];
    } else {
      next[accountId] = category;
    }
    setAccountCategoryPref(JSON.stringify(next));
  }

  function renderGroupedAccounts(
    scopedAccounts: AccountEntity[],
    sectionPrefix: string,
  ) {
    const validAccounts = scopedAccounts.filter(hasValidAccountId);
    const groups: Record<AccountGroup, AccountEntity[]> = {
      bank: [],
      credit: [],
      investment: [],
      other: [],
    };

    validAccounts.forEach(account => {
      groups[classifyAccount(account, accountCategoryOverrides)].push(account);
    });

    const order: Array<{ key: AccountGroup; label: string }> = [
      { key: 'bank', label: t('Bank Accounts') },
      { key: 'credit', label: t('Credit Cards') },
      { key: 'investment', label: t('Investments') },
      { key: 'other', label: t('Other Accounts') },
    ];

    return order.flatMap(({ key, label }) => {
      const list = [...groups[key]].sort(sortByInstitutionThenName);
      if (list.length === 0) return [];

      return [
        <SecondaryItem
          key={`${sectionPrefix}-${key}-header`}
          title={label}
          style={{ marginTop: 8, marginBottom: 3, opacity: 0.9 }}
          bold
          indent={10}
        />,
        ...list.map((account, i) => (
          <Account
            key={`${sectionPrefix}-${account.id}`}
            name={sidebarAccountLabel(account)}
            account={account}
            connected={!!account.bank}
            pending={syncingAccountIds.includes(account.id)}
            failed={failedAccounts.has(account.id)}
            updated={updatedAccounts.includes(account.id)}
            to={getAccountPath(account)}
            query={bindings.accountBalance(account.id)}
            displayBalance={account.balance_current}
            onDragChange={onDragChange}
            onDrop={onReorder}
            outerStyle={makeDropPadding(i)}
            onSetCategory={onSetAccountCategory}
          />
        )),
      ];
    });
  }

  return (
    <View
      style={{
        flexGrow: 1,
        '@media screen and (max-height: 480px)': {
          minHeight: 'auto',
        },
      }}
    >
      <View
        style={{
          height: 1,
          backgroundColor: theme.sidebarItemBackgroundHover,
          marginTop: 15,
          flexShrink: 0,
        }}
      />

      <View style={{ overflow: 'auto' }}>
        <Account
          name={t('All accounts')}
          to="/accounts"
          query={bindings.allAccountBalance()}
          style={{ fontWeight, marginTop: 15 }}
          isExactPathMatch
          balanceTestId="sidebar-all-accounts-balance"
        />

        {onBudgetAccounts.length > 0 && (
          <Account
            name={t('On budget')}
            to="/accounts/onbudget"
            query={bindings.onBudgetAccountBalance()}
            style={{
              fontWeight,
              marginTop: 13,
              marginBottom: 5,
            }}
            titleAccount
            balanceTestId="sidebar-on-budget-balance"
          />
        )}

        {renderGroupedAccounts(onBudgetAccounts, 'onbudget')}

        {offbudgetAccounts.length > 0 && (
          <Account
            name={t('Off budget')}
            to="/accounts/offbudget"
            query={bindings.offBudgetAccountBalance()}
            style={{
              fontWeight,
              marginTop: 13,
              marginBottom: 5,
            }}
            titleAccount
            balanceTestId="sidebar-off-budget-balance"
          />
        )}

        {renderGroupedAccounts(offbudgetAccounts, 'offbudget')}

        {simpleFinAccounts.length > 0 && (
          <SecondaryItem
            style={{ marginTop: 13, marginBottom: 5 }}
            title={t('SimpleFIN')}
            to="/accounts/simplefin"
            bold
          />
        )}

        {closedAccounts.length > 0 && (
          <SecondaryItem
            style={{ marginTop: 15 }}
            title={
              showClosedAccounts
                ? t('Closed accounts')
                : t('Closed accounts...')
            }
            onClick={onToggleClosedAccounts}
            bold
          />
        )}

        {showClosedAccounts &&
          closedAccounts.filter(hasValidAccountId).map(account => (
            <Account
              key={account.id}
              name={sidebarAccountLabel(account)}
              account={account}
              to={getAccountPath(account)}
              query={bindings.accountBalance(account.id)}
              displayBalance={account.balance_current}
              onDragChange={onDragChange}
              onDrop={onReorder}
              onSetCategory={onSetAccountCategory}
            />
          ))}
      </View>
    </View>
  );
}
