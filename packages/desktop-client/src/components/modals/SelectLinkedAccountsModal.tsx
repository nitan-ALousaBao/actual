import { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { Input } from '@actual-app/components/input';
import { Select } from '@actual-app/components/select';
import { SpaceBetween } from '@actual-app/components/space-between';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { Tooltip } from '@actual-app/components/tooltip';
import { View } from '@actual-app/components/view';
import { currentDay, subDays } from '@actual-app/core/shared/months';
import { amountToInteger } from '@actual-app/core/shared/util';
import type {
  AccountEntity,
  SyncServerEnableBankingAccount,
  SyncServerGoCardlessAccount,
  SyncServerPluggyAiAccount,
  SyncServerSimpleFinAccount,
} from '@actual-app/core/types/models';
import { format as formatDate, parseISO } from 'date-fns';

import {
  useLinkAccountEnableBankingMutation,
  useLinkAccountMutation,
  useLinkAccountPluggyAiMutation,
  useLinkAccountSimpleFinMutation,
  useUnlinkAccountMutation,
} from '#accounts';
import { Autocomplete } from '#components/autocomplete/Autocomplete';
import type { AutocompleteItem } from '#components/autocomplete/Autocomplete';
import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { Cell, Field, Row, Table, TableHeader } from '#components/table';
import { AmountInput } from '#components/util/AmountInput';
import { useAccounts } from '#hooks/useAccounts';
import { useDateFormat } from '#hooks/useDateFormat';
import { useFormat } from '#hooks/useFormat';
import { closeModal } from '#modals/modalsSlice';
import { addNotification } from '#notifications/notificationsSlice';
import { transactions } from '#queries';
import { liveQuery } from '#queries/liveQuery';
import { useDispatch } from '#redux';

function useAddBudgetAccountOptions() {
  const { t } = useTranslation();

  const addOnBudgetAccountOption = {
    id: 'new-on',
    name: t('Create new account'),
  };
  const addOffBudgetAccountOption = {
    id: 'new-off',
    name: t('Create new account (off budget)'),
  };

  return { addOnBudgetAccountOption, addOffBudgetAccountOption };
}

/**
 * Helper to determine if the chosen account option represents creating a new account.
 */
function isNewAccountOption(
  chosenAccountId: string | undefined,
  addOnBudgetOptionId: string,
  addOffBudgetOptionId: string,
): boolean {
  return (
    chosenAccountId === addOnBudgetOptionId ||
    chosenAccountId === addOffBudgetOptionId
  );
}

export type SelectLinkedAccountsModalProps =
  | {
      requisitionId: string;
      externalAccounts: SyncServerGoCardlessAccount[];
      syncSource: 'goCardless';
      upgradingAccountId?: string;
    }
  | {
      requisitionId?: undefined;
      externalAccounts: SyncServerSimpleFinAccount[];
      syncSource: 'simpleFin';
      upgradingAccountId?: string;
    }
  | {
      requisitionId?: undefined;
      externalAccounts: SyncServerPluggyAiAccount[];
      syncSource: 'pluggyai';
      upgradingAccountId?: string;
    }
  | {
      requisitionId?: undefined;
      externalAccounts: SyncServerEnableBankingAccount[];
      syncSource: 'enableBanking';
      upgradingAccountId?: string;
    };

export function SelectLinkedAccountsModal({
  requisitionId = undefined,
  externalAccounts,
  syncSource,
  upgradingAccountId,
}: SelectLinkedAccountsModalProps) {
  const propsWithSortedExternalAccounts =
    useMemo<SelectLinkedAccountsModalProps>(() => {
      const toSort = externalAccounts ? [...externalAccounts] : [];
      toSort.sort(
        (a, b) =>
          getInstitutionName(a)?.localeCompare(getInstitutionName(b)) ||
          a.name.localeCompare(b.name),
      );
      switch (syncSource) {
        case 'simpleFin':
          return {
            syncSource: 'simpleFin',
            externalAccounts: toSort as SyncServerSimpleFinAccount[],
            upgradingAccountId,
          };
        case 'pluggyai':
          return {
            syncSource: 'pluggyai',
            externalAccounts: toSort as SyncServerPluggyAiAccount[],
            upgradingAccountId,
          };
        case 'goCardless':
          return {
            syncSource: 'goCardless',
            requisitionId: requisitionId!,
            externalAccounts: toSort as SyncServerGoCardlessAccount[],
            upgradingAccountId,
          };
        case 'enableBanking':
          return {
            syncSource: 'enableBanking',
            externalAccounts: toSort as SyncServerEnableBankingAccount[],
            upgradingAccountId,
          };
        default:
          throw new Error(`Unrecognized sync source: ${String(syncSource)}`);
      }
    }, [externalAccounts, syncSource, requisitionId, upgradingAccountId]);

  const { t } = useTranslation();
  const { isNarrowWidth } = useResponsive();
  const dispatch = useDispatch();
  const { data: allAccounts = [] } = useAccounts();
  const localAccounts = allAccounts.filter(a => a.closed === 0);
  const [draftLinkAccounts, setDraftLinkAccounts] = useState<
    Map<string, 'linking' | 'unlinking'>
  >(() => {
    const externalAccountIds = new Set(externalAccounts.map(a => a.account_id));
    const initial = new Map<string, 'linking' | 'unlinking'>();
    for (const acc of localAccounts) {
      if (acc.account_id && externalAccountIds.has(acc.account_id)) {
        initial.set(acc.account_id, 'linking');
      }
    }
    return initial;
  });
  const [chosenAccounts, setChosenAccounts] = useState<Record<string, string>>(
    () => {
      const initiallyChosenAccounts = Object.fromEntries(
        localAccounts
          .filter(acc => acc.account_id)
          .map(acc => [acc.account_id, acc.id]),
      );

      const preselectedExternalAccount =
        propsWithSortedExternalAccounts.externalAccounts.find(
          account => initiallyChosenAccounts[account.account_id] == null,
        );

      if (
        upgradingAccountId &&
        preselectedExternalAccount &&
        !Object.values(initiallyChosenAccounts).includes(upgradingAccountId)
      ) {
        initiallyChosenAccounts[preselectedExternalAccount.account_id] =
          upgradingAccountId;
      }

      return initiallyChosenAccounts;
    },
  );
  const [customStartingDates, setCustomStartingDates] = useState<
    Record<string, StartingBalanceInfo>
  >({});
  const [bulkFillMode, setBulkFillMode] = useState<
    'today-current' | 'three-month-estimate'
  >('today-current');
  const { addOnBudgetAccountOption, addOffBudgetAccountOption } =
    useAddBudgetAccountOptions();

  const linkAccount = useLinkAccountMutation();
  const unlinkAccount = useUnlinkAccountMutation();
  const linkAccountSimpleFin = useLinkAccountSimpleFinMutation();
  const linkAccountPluggyAi = useLinkAccountPluggyAiMutation();
  const linkAccountEnableBanking = useLinkAccountEnableBankingMutation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onNext() {
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);

    const chosenLocalAccountIds = Object.values(chosenAccounts);

    let succeeded = 0;
    const failedNames: string[] = [];

    try {
      // Unlink accounts that were previously linked, but the user
      // chose to remove the bank-sync
      for (const acc of localAccounts
        .filter(localAcc => localAcc.account_id)
        .filter(localAcc => !chosenLocalAccountIds.includes(localAcc.id))) {
        try {
          await unlinkAccount.mutateAsync({ id: acc.id });
        } catch {
          failedNames.push(acc.name);
        }
      }

      // Link accounts sequentially to avoid request storms/rate-limit issues
      for (const [chosenExternalAccountId, chosenLocalAccountId] of Object.entries(
        chosenAccounts,
      )) {
        const externalAccountIndex =
          propsWithSortedExternalAccounts.externalAccounts.findIndex(
            account => account.account_id === chosenExternalAccountId,
          );
        const offBudget = chosenLocalAccountId === addOffBudgetAccountOption.id;

        // Skip linking accounts that were previously linked with
        // a different bank.
        if (externalAccountIndex === -1) {
          return;
        }

        // Finally link the matched account
        const customSettings = customStartingDates[chosenExternalAccountId];
        const isCreatingNewAccount = isNewAccountOption(
          chosenLocalAccountId,
          addOnBudgetAccountOption.id,
          addOffBudgetAccountOption.id,
        );
        const defaultStartingDate = subDays(currentDay(), 89);
        const defaultStartingBalance =
          propsWithSortedExternalAccounts.externalAccounts[externalAccountIndex]
            ?.balance != null
            ? amountToInteger(
                propsWithSortedExternalAccounts.externalAccounts[
                  externalAccountIndex
                ]!.balance,
              )
            : 0;

        const startingDate =
          customSettings?.date && customSettings.date.trim() !== ''
            ? customSettings.date
            : isCreatingNewAccount
              ? defaultStartingDate
              : undefined;
        const startingBalance =
          customSettings?.autoEstimate
            ? undefined
            : customSettings?.amount != null
            ? customSettings.amount
            : isCreatingNewAccount
              ? defaultStartingBalance
              : undefined;

        try {
          if (propsWithSortedExternalAccounts.syncSource === 'simpleFin') {
            const selectedExternalAccount =
              propsWithSortedExternalAccounts.externalAccounts[
                externalAccountIndex
              ];
            await linkAccountSimpleFin.mutateAsync({
              externalAccount: selectedExternalAccount,
              upgradingId:
                chosenLocalAccountId !== addOnBudgetAccountOption.id &&
                chosenLocalAccountId !== addOffBudgetAccountOption.id
                  ? chosenLocalAccountId
                  : undefined,
              offBudget,
              startingDate,
              startingBalance,
            });
          } else if (propsWithSortedExternalAccounts.syncSource === 'pluggyai') {
            const selectedExternalAccount =
              propsWithSortedExternalAccounts.externalAccounts[
                externalAccountIndex
              ];
            await linkAccountPluggyAi.mutateAsync({
              externalAccount: selectedExternalAccount,
              upgradingId:
                chosenLocalAccountId !== addOnBudgetAccountOption.id &&
                chosenLocalAccountId !== addOffBudgetAccountOption.id
                  ? chosenLocalAccountId
                  : undefined,
              offBudget,
              startingDate,
              startingBalance,
            });
          } else if (
            propsWithSortedExternalAccounts.syncSource === 'enableBanking'
          ) {
            const selectedExternalAccount =
              propsWithSortedExternalAccounts.externalAccounts[
                externalAccountIndex
              ];
            await linkAccountEnableBanking.mutateAsync({
              externalAccount: selectedExternalAccount,
              upgradingId:
                chosenLocalAccountId !== addOnBudgetAccountOption.id &&
                chosenLocalAccountId !== addOffBudgetAccountOption.id
                  ? chosenLocalAccountId
                  : undefined,
              offBudget,
              startingDate,
              startingBalance,
            });
          } else {
            const selectedExternalAccount =
              propsWithSortedExternalAccounts.externalAccounts[
                externalAccountIndex
              ];
            await linkAccount.mutateAsync({
              requisitionId: propsWithSortedExternalAccounts.requisitionId,
              account: selectedExternalAccount,
              upgradingId:
                chosenLocalAccountId !== addOnBudgetAccountOption.id &&
                chosenLocalAccountId !== addOffBudgetAccountOption.id
                  ? chosenLocalAccountId
                  : undefined,
              offBudget,
              startingDate,
              startingBalance,
            });
          }
          succeeded += 1;
        } catch {
          const failedExternalName =
            propsWithSortedExternalAccounts.externalAccounts[
              externalAccountIndex
            ]?.name || chosenExternalAccountId;
          failedNames.push(failedExternalName);
        }
      }

      if (failedNames.length > 0) {
        dispatch(
          addNotification({
            notification: {
              type: 'error',
              message: t(
                'Some accounts failed to link: {{names}}',
                { names: failedNames.slice(0, 5).join(', ') },
              ),
            },
          }),
        );
      }

      if (succeeded > 0) {
        dispatch(closeModal());
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const unlinkedAccounts = localAccounts.filter(
    account => !Object.values(chosenAccounts).includes(account.id),
  );

  function onSetLinkedAccount(
    externalAccount:
      | SyncServerGoCardlessAccount
      | SyncServerSimpleFinAccount
      | SyncServerPluggyAiAccount,
    localAccountId: string | null | undefined,
  ) {
    setChosenAccounts(accounts => {
      const updatedAccounts = { ...accounts };

      if (localAccountId) {
        updatedAccounts[externalAccount.account_id] = localAccountId;
        setDraftLinkAccounts(prev =>
          new Map(prev).set(externalAccount.account_id, 'linking'),
        );
      } else {
        delete updatedAccounts[externalAccount.account_id];
        setDraftLinkAccounts(prev =>
          new Map(prev).set(externalAccount.account_id, 'unlinking'),
        );
      }

      return updatedAccounts;
    });
  }

  const getChosenAccount = (accountId: string) => {
    const chosenId = chosenAccounts[accountId];
    if (!chosenId) return undefined;

    if (chosenId === addOnBudgetAccountOption.id) {
      return addOnBudgetAccountOption;
    }
    if (chosenId === addOffBudgetAccountOption.id) {
      return addOffBudgetAccountOption;
    }

    return localAccounts.find(acc => acc.id === chosenId);
  };

  // Memoize default starting settings to avoid repeated calculations
  const defaultStartingSettings = useMemo<StartingBalanceInfo>(
    () => ({
      date: subDays(currentDay(), 89),
      amount: 0,
    }),
    [],
  );

  const getCustomStartingDate = (accountId: string) => {
    if (customStartingDates[accountId]) {
      return customStartingDates[accountId];
    }
    // Default to 89 days ago (90 days inclusive, matches server default)
    return defaultStartingSettings;
  };

  const setCustomStartingDate = (
    accountId: string,
    settings: StartingBalanceInfo,
  ) => {
    setCustomStartingDates(prev => ({
      ...prev,
      [accountId]: settings,
    }));
  };

  const label = useMemo(() => {
    const s = new Set(draftLinkAccounts.values());
    if (s.has('linking') && s.has('unlinking')) {
      return t('Link and unlink accounts');
    } else if (s.has('linking')) {
      return t('Link accounts');
    } else if (s.has('unlinking')) {
      return t('Unlink accounts');
    }

    return t('Link or unlink accounts');
  }, [draftLinkAccounts, t]);

  function onBulkLinkWithDefaults() {
    const nextChosenAccounts: Record<string, string> = { ...chosenAccounts };
    const nextCustomDates: Record<string, StartingBalanceInfo> = {
      ...customStartingDates,
    };
    const nextDraft = new Map(draftLinkAccounts);

    propsWithSortedExternalAccounts.externalAccounts.forEach(account => {
      nextChosenAccounts[account.account_id] = addOnBudgetAccountOption.id;
      nextCustomDates[account.account_id] =
        bulkFillMode === 'today-current'
          ? {
              date: currentDay(),
              amount:
                account.balance != null ? amountToInteger(account.balance) : 0,
              autoEstimate: false,
            }
          : {
              // Leave starting balance auto-estimated by server for 3-month import.
              date: subDays(currentDay(), 89),
              amount:
                account.balance != null ? amountToInteger(account.balance) : 0,
              autoEstimate: true,
            };
      nextDraft.set(account.account_id, 'linking');
    });

    setChosenAccounts(nextChosenAccounts);
    setCustomStartingDates(nextCustomDates);
    setDraftLinkAccounts(nextDraft);
    dispatch(
      addNotification({
        notification: {
          type: 'message',
          message: t(
            'Accounts have been prefilled. Review them and click "Link accounts" to submit.',
          ),
          timeout: 5000,
        },
      }),
    );
  }

  return (
    <Modal
      name="select-linked-accounts"
      containerProps={{
        style: isNarrowWidth
          ? {
              width: '100vw',
              maxWidth: '100vw',
              height: '100vh',
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
            }
          : { width: 1000 },
      }}
    >
      {({ state }) => (
        <View
          style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
        >
          <ModalHeader
            title={t('Link Accounts')}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />

          <View
            style={{
              padding: isNarrowWidth ? '0 16px' : '0 20px',
              flexShrink: 0,
            }}
          >
            <Text style={{ marginBottom: 20 }}>
              <Trans>
                We found the following accounts. Select which ones you want to
                add:
              </Trans>
            </Text>
          </View>

          {isNarrowWidth ? (
            <View
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '0 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {propsWithSortedExternalAccounts.externalAccounts.map(account => (
                <AccountCard
                  key={account.account_id}
                  externalAccount={account}
                  chosenAccount={getChosenAccount(account.account_id)}
                  unlinkedAccounts={unlinkedAccounts}
                  onSetLinkedAccount={onSetLinkedAccount}
                  customStartingDate={getCustomStartingDate(account.account_id)}
                  onSetCustomStartingDate={setCustomStartingDate}
                />
              ))}
            </View>
          ) : (
            <View
              style={{ ...styles.tableContainer, height: 300, flex: 'unset' }}
            >
              <TableHeader>
                <Cell value={t('Institution to Sync')} width={150} />
                <Cell value={t('Bank Account To Sync')} width={150} />
                <Cell value={t('Balance')} width={120} />
                <Cell value={t('Account in Actual')} width="flex" />
                <Cell value={t('Starting Date')} width={120} />
                <Cell value={t('Starting Balance')} width={120} />
                <Cell value={t('Actions')} width={150} textAlign="center" />
              </TableHeader>

              <Table<ExternalAccount & { id: string }>
                items={propsWithSortedExternalAccounts.externalAccounts.map(
                  acc => ({ ...acc, id: acc.account_id }),
                )}
                style={{ backgroundColor: theme.tableHeaderBackground }}
                renderItem={({ item }) => {
                  const chosenAccount = getChosenAccount(item.account_id);
                  // Only show starting options for new accounts being created
                  const shouldShowStartingOptions = isNewAccountOption(
                    chosenAccount?.id,
                    addOnBudgetAccountOption.id,
                    addOffBudgetAccountOption.id,
                  );

                  return (
                    <TableRow
                      key={item.id}
                      externalAccount={item}
                      chosenAccount={chosenAccount}
                      unlinkedAccounts={unlinkedAccounts}
                      onSetLinkedAccount={onSetLinkedAccount}
                      customStartingDate={getCustomStartingDate(
                        item.account_id,
                      )}
                      onSetCustomStartingDate={setCustomStartingDate}
                      showStartingOptions={shouldShowStartingOptions}
                    />
                  );
                }}
              />
            </View>
          )}

          <View
            style={{
              flexDirection: isNarrowWidth ? 'column' : 'row',
              justifyContent: isNarrowWidth ? 'center' : 'space-between',
              alignItems: isNarrowWidth ? 'stretch' : 'center',
              gap: 10,
              ...(isNarrowWidth
                ? {
                    padding: '16px',
                    flexShrink: 0,
                    borderTop: `1px solid ${theme.tableBorder}`,
                  }
                : { marginTop: 10 }),
            }}
          >
            <Button
              variant="bare"
              onPress={onBulkLinkWithDefaults}
              style={
                isNarrowWidth
                  ? {
                      width: '100%',
                      height: '44px',
                      fontSize: '1em',
                    }
                  : undefined
              }
            >
              <Trans>Auto fill all (review first)</Trans>
            </Button>
            <View style={{ minWidth: 280 }}>
              <Select
                value={bulkFillMode}
                options={[
                  ['today-current', t('Default: today + current balance')],
                  [
                    'three-month-estimate',
                    t('Default: 3 months ago + estimated balance'),
                  ],
                ]}
                onChange={value =>
                  setBulkFillMode(
                    value as 'today-current' | 'three-month-estimate',
                  )
                }
              />
            </View>
            <Button
              variant="primary"
              onPress={onNext}
              isDisabled={draftLinkAccounts.size === 0 || isSubmitting}
              style={
                isNarrowWidth
                  ? {
                      width: '100%',
                      height: '44px',
                      fontSize: '1em',
                    }
                  : undefined
              }
            >
              {isSubmitting ? t('Submitting...') : label}
            </Button>
          </View>
        </View>
      )}
    </Modal>
  );
}

type ExternalAccount =
  | SyncServerGoCardlessAccount
  | SyncServerSimpleFinAccount
  | SyncServerPluggyAiAccount
  | SyncServerEnableBankingAccount;

type StartingBalanceInfo = {
  date: string;
  amount: number;
  autoEstimate?: boolean;
};

type SharedAccountRowProps = {
  externalAccount: ExternalAccount;
  chosenAccount: { id: string; name: string } | undefined;
  unlinkedAccounts: AccountEntity[];
  onSetLinkedAccount: (
    externalAccount: ExternalAccount,
    localAccountId: string | null | undefined,
  ) => void;
};

function getAvailableAccountOptions(
  unlinkedAccounts: AccountEntity[],
  chosenAccount: { id: string; name: string } | undefined,
  addOnBudgetAccountOption: { id: string; name: string },
  addOffBudgetAccountOption: { id: string; name: string },
): AutocompleteItem[] {
  const options: AutocompleteItem[] = [...unlinkedAccounts];
  if (
    chosenAccount &&
    chosenAccount.id !== addOnBudgetAccountOption.id &&
    chosenAccount.id !== addOffBudgetAccountOption.id
  ) {
    options.push(chosenAccount);
  }
  options.push(addOnBudgetAccountOption, addOffBudgetAccountOption);
  return options;
}

type TableRowProps = SharedAccountRowProps & {
  customStartingDate: StartingBalanceInfo;
  onSetCustomStartingDate: (
    accountId: string,
    settings: StartingBalanceInfo,
  ) => void;
  showStartingOptions: boolean;
};

function useStartingBalanceInfo(accountId: string | undefined) {
  const [info, setInfo] = useState<StartingBalanceInfo | null>(null);

  useEffect(() => {
    if (!accountId) {
      setInfo(null);
      return;
    }

    const query = transactions(accountId)
      .filter({ starting_balance_flag: true })
      .select(['date', 'amount'])
      .limit(1);

    const live = liveQuery<StartingBalanceInfo>(query, {
      onData: data => {
        setInfo(data?.[0] ?? null);
      },
      onError: () => {
        setInfo(null);
      },
    });

    return () => {
      live?.unsubscribe();
    };
  }, [accountId]);

  return info;
}

function TableRow({
  externalAccount,
  chosenAccount,
  unlinkedAccounts,
  onSetLinkedAccount,
  customStartingDate,
  onSetCustomStartingDate,
  showStartingOptions,
}: TableRowProps) {
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const { addOnBudgetAccountOption, addOffBudgetAccountOption } =
    useAddBudgetAccountOptions();
  const format = useFormat();
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';
  const { t } = useTranslation();
  const startingBalanceInfo = useStartingBalanceInfo(
    showStartingOptions ? undefined : chosenAccount?.id,
  );

  const availableAccountOptions = getAvailableAccountOptions(
    unlinkedAccounts,
    chosenAccount,
    addOnBudgetAccountOption,
    addOffBudgetAccountOption,
  );

  return (
    <Row style={{ backgroundColor: theme.tableBackground }}>
      {/* Institution to Sync */}
      <Field width={150}>
        <Tooltip content={getInstitutionName(externalAccount)}>
          <View
            style={{
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              display: 'block',
            }}
          >
            {getInstitutionName(externalAccount)}
          </View>
        </Tooltip>
      </Field>
      {/* Bank Account To Sync */}
      <Field width={150}>
        <Tooltip content={externalAccount.name}>
          <View
            style={{
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              display: 'block',
            }}
          >
            {externalAccount.name}
          </View>
        </Tooltip>
      </Field>
      {/* Balance */}
      <Field width={120} style={{ textAlign: 'right' }}>
        <PrivacyFilter>
          {externalAccount.balance != null ? (
            <FinancialText>
              {format(externalAccount.balance.toString(), 'financial')}
            </FinancialText>
          ) : (
            t('Unknown')
          )}
        </PrivacyFilter>
      </Field>
      {/* Account in Actual */}
      <Field
        width="flex"
        truncate={focusedField !== 'account'}
        onClick={() => setFocusedField('account')}
      >
        {focusedField === 'account' ? (
          <Autocomplete
            focused
            strict
            highlightFirst
            suggestions={availableAccountOptions}
            onSelect={value => {
              onSetLinkedAccount(externalAccount, value);
            }}
            inputProps={{
              onBlur: () => setFocusedField(null),
            }}
            value={chosenAccount?.id}
          />
        ) : (
          chosenAccount?.name
        )}
      </Field>
      {showStartingOptions ? (
        <StartingOptionsFields
          accountId={externalAccount.account_id}
          externalBalance={externalAccount.balance}
          customStartingDate={customStartingDate}
          onSetCustomStartingDate={onSetCustomStartingDate}
          layout="inline"
        />
      ) : (
        <>
          {/* Starting Date */}
          <Field width={120} truncate={false} style={{ textAlign: 'right' }}>
            {startingBalanceInfo ? (
              <Text
                style={{
                  color: theme.pageTextSubdued,
                  fontStyle: 'italic',
                }}
              >
                {formatDate(parseISO(startingBalanceInfo.date), dateFormat)}
              </Text>
            ) : null}
          </Field>
          {/* Starting Balance */}
          <Field width={120} truncate={false} style={{ textAlign: 'right' }}>
            {startingBalanceInfo ? (
              <PrivacyFilter>
                <FinancialText
                  style={{
                    color: theme.pageTextSubdued,
                    fontStyle: 'italic',
                  }}
                >
                  {format(startingBalanceInfo.amount, 'financial')}
                </FinancialText>
              </PrivacyFilter>
            ) : null}
          </Field>
        </>
      )}
      {/* Actions */}
      <Field width={150}>
        {chosenAccount ? (
          <Button
            onPress={() => {
              onSetLinkedAccount(externalAccount, null);
            }}
            style={{ float: 'right' }}
          >
            <Trans>Remove bank sync</Trans>
          </Button>
        ) : (
          <Button
            variant="primary"
            onPress={() => {
              setFocusedField('account');
            }}
            style={{ float: 'right' }}
          >
            <Trans>Set up bank sync</Trans>
          </Button>
        )}
      </Field>
    </Row>
  );
}

function getInstitutionName(
  externalAccount:
    | SyncServerGoCardlessAccount
    | SyncServerSimpleFinAccount
    | SyncServerPluggyAiAccount
    | SyncServerEnableBankingAccount,
) {
  if (typeof externalAccount?.institution === 'string') {
    return externalAccount?.institution ?? '';
  } else if (typeof externalAccount.institution?.name === 'string') {
    return externalAccount?.institution?.name ?? '';
  }
  return '';
}

type StartingOptionsFieldsProps = {
  accountId: string;
  externalBalance: number | null | undefined;
  customStartingDate: StartingBalanceInfo;
  onSetCustomStartingDate: (
    accountId: string,
    settings: StartingBalanceInfo,
  ) => void;
  layout: 'inline' | 'stacked';
};

function StartingOptionsFields({
  accountId,
  externalBalance,
  customStartingDate,
  onSetCustomStartingDate,
  layout,
}: StartingOptionsFieldsProps) {
  const zeroSign = externalBalance != null && externalBalance < 0 ? '-' : '+';

  if (layout === 'inline') {
    return (
      <>
        {/* Starting Date */}
        <Field width={120} truncate={false}>
          <Input
            type="date"
            value={customStartingDate.date}
            onChange={e =>
              onSetCustomStartingDate(accountId, {
                ...customStartingDate,
                date: e.target.value,
                autoEstimate: false,
              })
            }
            style={{ width: '100%' }}
          />
        </Field>
        {/* Starting Balance */}
        <Field width={120} truncate={false} style={{ textAlign: 'right' }}>
          <AmountInput
            value={customStartingDate.amount}
            zeroSign={zeroSign}
            onUpdate={amount =>
              onSetCustomStartingDate(accountId, {
                ...customStartingDate,
                amount,
                autoEstimate: false,
              })
            }
            style={{ width: '100%' }}
          />
        </Field>
      </>
    );
  }

  return (
    <View
      style={{
        marginTop: 8,
        padding: '12px',
        backgroundColor: theme.tableHeaderBackground,
        borderRadius: 4,
      }}
    >
      <View style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <View>
          <Text
            style={{
              marginBottom: 4,
              fontSize: 13,
              color: theme.pageTextSubdued,
            }}
          >
            <Trans>Starting date:</Trans>
          </Text>
          <Input
            type="date"
            value={customStartingDate.date}
            onChange={e =>
              onSetCustomStartingDate(accountId, {
                ...customStartingDate,
                date: e.target.value,
                autoEstimate: false,
              })
            }
            style={{ width: '100%' }}
          />
        </View>
        <View>
          <Text
            style={{
              marginBottom: 4,
              fontSize: 13,
              color: theme.pageTextSubdued,
            }}
          >
            <Trans>Balance on that date:</Trans>
          </Text>
          <AmountInput
            value={customStartingDate.amount}
            zeroSign={zeroSign}
            onUpdate={amount =>
              onSetCustomStartingDate(accountId, {
                ...customStartingDate,
                amount,
                autoEstimate: false,
              })
            }
            style={{ width: '100%' }}
          />
        </View>
      </View>
    </View>
  );
}

type AccountCardProps = SharedAccountRowProps & {
  customStartingDate: StartingBalanceInfo;
  onSetCustomStartingDate: (
    accountId: string,
    settings: StartingBalanceInfo,
  ) => void;
};

function AccountCard({
  externalAccount,
  chosenAccount,
  unlinkedAccounts,
  onSetLinkedAccount,
  customStartingDate,
  onSetCustomStartingDate,
}: AccountCardProps) {
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const { addOnBudgetAccountOption, addOffBudgetAccountOption } =
    useAddBudgetAccountOptions();
  const format = useFormat();
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';
  const { t } = useTranslation();

  const availableAccountOptions = getAvailableAccountOptions(
    unlinkedAccounts,
    chosenAccount,
    addOnBudgetAccountOption,
    addOffBudgetAccountOption,
  );

  // Only show starting date options for new accounts being created
  const shouldShowStartingOptions = isNewAccountOption(
    chosenAccount?.id,
    addOnBudgetAccountOption.id,
    addOffBudgetAccountOption.id,
  );
  const startingBalanceInfo = useStartingBalanceInfo(
    shouldShowStartingOptions ? undefined : chosenAccount?.id,
  );

  return (
    <SpaceBetween
      direction="vertical"
      gap={10}
      style={{
        backgroundColor: theme.tableBackground,
        borderRadius: 8,
        padding: '12px 16px',
        border: `1px solid ${theme.tableBorder}`,
        minHeight: 'fit-content',
        alignItems: 'stretch',
      }}
    >
      <View
        style={{
          fontWeight: 600,
          fontSize: '1.1em',
          color: theme.pageText,
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
        }}
      >
        {externalAccount.name}
      </View>

      <View
        style={{
          fontSize: '0.9em',
          color: theme.pageTextSubdued,
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
        }}
      >
        {getInstitutionName(externalAccount)}
      </View>

      <View
        style={{
          fontSize: '0.9em',
          color: theme.pageTextSubdued,
        }}
      >
        <Trans>Balance:</Trans>{' '}
        <PrivacyFilter>
          {externalAccount.balance != null ? (
            <FinancialText>
              {format(externalAccount.balance.toString(), 'financial')}
            </FinancialText>
          ) : (
            t('Unknown')
          )}
        </PrivacyFilter>
      </View>

      <SpaceBetween
        direction="horizontal"
        gap={5}
        style={{
          fontSize: '0.9em',
          color: theme.pageTextSubdued,
        }}
      >
        <Text>
          <Trans>Linked to:</Trans>
        </Text>
        {chosenAccount ? (
          <Text style={{ color: theme.noticeTextLight, fontWeight: 500 }}>
            {chosenAccount.name}
          </Text>
        ) : (
          <Text style={{ color: theme.pageTextSubdued }}>
            <Trans>Not linked</Trans>
          </Text>
        )}
      </SpaceBetween>

      {!shouldShowStartingOptions && startingBalanceInfo && (
        <View
          style={{
            fontSize: '0.9em',
            color: theme.pageTextSubdued,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <View style={{ display: 'flex', flexDirection: 'row', gap: 4 }}>
            <Text style={{ color: theme.pageTextSubdued }}>
              <Trans>Starting date:</Trans>
            </Text>
            <Text
              style={{
                color: theme.pageTextSubdued,
                fontStyle: 'italic',
              }}
            >
              {formatDate(parseISO(startingBalanceInfo.date), dateFormat)}
            </Text>
          </View>
          <View style={{ display: 'flex', flexDirection: 'row', gap: 4 }}>
            <Text style={{ color: theme.pageTextSubdued }}>
              <Trans>Starting balance:</Trans>
            </Text>
            <PrivacyFilter>
              <FinancialText
                style={{
                  color: theme.pageTextSubdued,
                  fontStyle: 'italic',
                }}
              >
                {format(startingBalanceInfo.amount, 'financial')}
              </FinancialText>
            </PrivacyFilter>
          </View>
        </View>
      )}

      {focusedField === 'account' && (
        <View style={{ marginBottom: 12 }}>
          <Autocomplete
            focused
            strict
            highlightFirst
            suggestions={availableAccountOptions}
            onSelect={value => {
              onSetLinkedAccount(externalAccount, value);
              setFocusedField(null);
            }}
            inputProps={{
              onBlur: () => setFocusedField(null),
              placeholder: t('Select account...'),
            }}
            value={chosenAccount?.id}
          />
        </View>
      )}

      {shouldShowStartingOptions && (
        <StartingOptionsFields
          accountId={externalAccount.account_id}
          externalBalance={externalAccount.balance}
          customStartingDate={customStartingDate}
          onSetCustomStartingDate={onSetCustomStartingDate}
          layout="stacked"
        />
      )}

      {chosenAccount ? (
        <Button
          onPress={() => {
            onSetLinkedAccount(externalAccount, null);
          }}
          style={{
            padding: '8px 16px',
            fontSize: '0.9em',
            width: '100%',
          }}
        >
          <Trans>Remove bank sync</Trans>
        </Button>
      ) : (
        <Button
          variant="primary"
          onPress={() => {
            setFocusedField('account');
          }}
          style={{
            padding: '8px 16px',
            fontSize: '0.9em',
            width: '100%',
          }}
        >
          <Trans>Link account</Trans>
        </Button>
      )}
    </SpaceBetween>
  );
}
