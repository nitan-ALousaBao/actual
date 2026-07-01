import { useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { Page } from '#components/Page';
import { useAccounts } from '#hooks/useAccounts';
import { useFormat } from '#hooks/useFormat';
import { useNavigate } from '#hooks/useNavigate';
import { useSyncedPref } from '#hooks/useSyncedPref';

import type { AccountCategoryMap, AccountGroup } from '../accounts/accountClassification';
import { classifyAccount, inferAccountGroup } from '../accounts/accountClassification';
import { findCardArt } from '../credit-card-benefits/cardArt';

import type { AccountEntity } from '@actual-app/core/types/models';

type HubGroup = AccountGroup;

type CreditCardBenefit = {
  id: string;
  accountId?: string;
  cardName: string;
  issuer: string;
  benefitName: string;
  amountLimit: number;
  usedAmount: number;
  resetDate: string;
  enrollmentRequired: boolean;
  enrolled: boolean;
};

type CreditCardFee = {
  id: string;
  accountId?: string;
  cardName: string;
  issuer: string;
  annualFee: number;
  feeDueDate: string;
  notes: string;
};

type RewardCard = {
  id: string;
  accountId?: string;
  cardName: string;
  issuer: string;
  imageUrl?: string;
  pointsCurrency: string;
  pointValueCents: number;
};

type RewardMultiplier = {
  id: string;
  rewardCardId: string;
  category: string;
  multiplier: number;
  notes: string;
};

type GroupConfig = {
  id: HubGroup;
  title: string;
  subtitle: string;
  accent: string;
};

const GROUPS: GroupConfig[] = [
  {
    id: 'credit',
    title: 'Credit cards',
    subtitle: 'Cards, balances, rewards, and payment attention.',
    accent: '#2563eb',
  },
  {
    id: 'bank',
    title: 'Bank accounts',
    subtitle: 'Checking, savings, cash, and deposit accounts.',
    accent: '#059669',
  },
  {
    id: 'investment',
    title: 'Investment accounts',
    subtitle: 'Brokerage, retirement, HSA, and portfolio accounts.',
    accent: '#7c3aed',
  },
  {
    id: 'other',
    title: 'Other accounts',
    subtitle: 'Accounts that still need classification.',
    accent: '#64748b',
  },
];

function parseAccountCategories(pref?: string | null): AccountCategoryMap {
  if (!pref) {
    return {};
  }

  try {
    const parsed = JSON.parse(pref);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function parseList<T>(pref?: string | null): T[] {
  if (!pref) {
    return [];
  }

  try {
    const parsed = JSON.parse(pref);
    return Array.isArray(parsed)
      ? parsed.filter(item => item && typeof item === 'object')
      : [];
  } catch {
    return [];
  }
}

function getInstitution(account: AccountEntity) {
  return (
    account.bankName?.trim() ||
    account.bank?.trim() ||
    account.official_name?.trim() ||
    'Manual account'
  );
}

function getAccountBalance(account: AccountEntity) {
  return typeof account.balance_current === 'number'
    ? account.balance_current
    : 0;
}

function safeAmount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function formatRewardRate(multiplier: number, pointValueCents: number) {
  const rate = multiplier * pointValueCents;
  return `${rate.toFixed(rate % 1 === 0 ? 0 : 2)}%`;
}

function getAccountArt(account: AccountEntity, accent: string) {
  const palettes = [
    ['#0f172a', accent],
    ['#172554', '#38bdf8'],
    ['#052e16', '#34d399'],
    ['#312e81', '#a78bfa'],
    ['#7f1d1d', '#fb7185'],
    ['#431407', '#f59e0b'],
  ];
  const seed = [...`${account.name}${getInstitution(account)}`].reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0,
  );
  const [from, to] = palettes[seed % palettes.length];

  return `linear-gradient(135deg, ${from}, ${to})`;
}

function findRewardCardForAccount(
  account: AccountEntity,
  rewardCards: RewardCard[],
) {
  const institution = getInstitution(account);
  const normalizedAccountName = account.name.toLowerCase();
  const normalizedInstitution = institution.toLowerCase();

  return rewardCards.find(card => {
    if (card.accountId === account.id) {
      return true;
    }

    const cardName = card.cardName.toLowerCase();
    const issuer = card.issuer.toLowerCase();
    return (
      (cardName && normalizedAccountName.includes(cardName)) ||
      (normalizedAccountName && cardName.includes(normalizedAccountName)) ||
      (issuer && normalizedInstitution.includes(issuer))
    );
  });
}

function getCreditCardArtForAccount(
  account: AccountEntity,
  rewardCards: RewardCard[],
) {
  const rewardCard = findRewardCardForAccount(account, rewardCards);

  return (
    rewardCard?.imageUrl ||
    findCardArt({
      issuer: rewardCard?.issuer || getInstitution(account),
      cardName: rewardCard?.cardName,
      accountName: account.name,
    })
  );
}

function AccountCard({
  account,
  group,
  imageUrl,
  selected,
  onSelect,
  format,
}: {
  account: AccountEntity;
  group: GroupConfig;
  imageUrl?: string;
  selected: boolean;
  onSelect: () => void;
  format: ReturnType<typeof useFormat>;
}) {
  const balance = getAccountBalance(account);

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        aspectRatio: '1.586 / 1',
        background: imageUrl ? '#f8fafc' : getAccountArt(account, group.accent),
        border: selected ? `2px solid ${theme.noticeText}` : '2px solid transparent',
        borderRadius: 18,
        boxShadow: selected
          ? '0 18px 34px rgba(0, 0, 0, 0.28)'
          : '0 10px 22px rgba(0, 0, 0, 0.18)',
        color: '#fff',
        cursor: 'pointer',
        display: 'block',
        height: 202,
        overflow: 'hidden',
        padding: imageUrl ? 0 : 18,
        position: 'relative',
        textAlign: 'left',
        width: '100%',
      }}
    >
      {imageUrl && (
        <>
          <img
            src={imageUrl}
            alt=""
            aria-hidden="true"
            style={{
              display: 'block',
              height: '100%',
              objectFit: 'contain',
              position: 'absolute',
              inset: 0,
              width: '100%',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(180deg, rgba(2, 6, 23, 0) 0%, rgba(2, 6, 23, 0.06) 48%, rgba(2, 6, 23, 0.52) 100%)',
            }}
          />
        </>
      )}
      <div
        style={{
          position: 'absolute',
          right: -44,
          top: -46,
          width: 150,
          height: 150,
          borderRadius: 999,
          background: 'rgba(255, 255, 255, 0.16)',
          display: imageUrl ? 'none' : 'block',
        }}
      />
      <div
        style={{
          bottom: imageUrl ? 14 : undefined,
          display: 'grid',
          gap: imageUrl ? 8 : 28,
          left: imageUrl ? 16 : undefined,
          position: imageUrl ? 'absolute' : 'relative',
          right: imageUrl ? 16 : undefined,
          textShadow: imageUrl ? '0 2px 8px rgba(0, 0, 0, 0.55)' : undefined,
          zIndex: 1,
        }}
      >
        <div>
          <Text style={{ color: '#fff', fontSize: 12 }}>{getInstitution(account)}</Text>
          <Text
            style={{
              color: '#fff',
              fontSize: imageUrl ? 16 : 18,
              fontWeight: 700,
              marginTop: 4,
            }}
          >
            {account.name}
          </Text>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <Text style={{ color: '#fff' }}>{group.title}</Text>
          <Text style={{ color: '#fff', fontWeight: 700 }}>
            {format(balance, 'financial')}
          </Text>
        </div>
      </div>
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View
      style={{
        borderTop: `1px solid ${theme.tableBorder}`,
        display: 'grid',
        flexShrink: 0,
        gap: 4,
        paddingTop: 10,
      }}
    >
      <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>{label}</Text>
      <Text style={{ fontWeight: 600 }}>{value}</Text>
    </View>
  );
}

function MetricTile({
  label,
  value,
  tone = theme.pageText,
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
}) {
  return (
    <View
      style={{
        backgroundColor: theme.pageBackground,
        border: `1px solid ${theme.tableBorder}`,
        borderRadius: 14,
        gap: 4,
        padding: 12,
      }}
    >
      <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: tone, fontSize: 18, fontWeight: 700 }}>{value}</Text>
    </View>
  );
}

function InfoBlock({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        borderTop: `1px solid ${theme.tableBorder}`,
        display: 'block',
        paddingTop: 12,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <div
        style={{
          color: theme.pageTextSubdued,
          lineHeight: 1.45,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ButtonRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        alignItems: 'center',
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 2,
        minHeight: 30,
        paddingBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

export function AccountsHub() {
  const { t } = useTranslation();
  const format = useFormat();
  const navigate = useNavigate();
  const { data: accounts = [] } = useAccounts();
  const [accountCategoryPref] = useSyncedPref('custom-sync-mappings-account-category');
  const [benefitsPref] = useSyncedPref('custom-sync-mappings-credit-card-benefits');
  const [feesPref] = useSyncedPref('custom-sync-mappings-credit-card-fees');
  const [rewardCardsPref] = useSyncedPref(
    'custom-sync-mappings-credit-card-reward-cards',
  );
  const [rewardMultipliersPref] = useSyncedPref(
    'custom-sync-mappings-credit-card-reward-multipliers',
  );
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [activeGroupId, setActiveGroupId] = useState<HubGroup>('credit');
  const walletScrollRef = useRef<HTMLDivElement | null>(null);

  const accountCategoryMap = useMemo(
    () => parseAccountCategories(accountCategoryPref),
    [accountCategoryPref],
  );
  const benefits = useMemo(
    () => parseList<CreditCardBenefit>(benefitsPref),
    [benefitsPref],
  );
  const fees = useMemo(() => parseList<CreditCardFee>(feesPref), [feesPref]);
  const rewardCards = useMemo(
    () => parseList<RewardCard>(rewardCardsPref),
    [rewardCardsPref],
  );
  const rewardMultipliers = useMemo(
    () => parseList<RewardMultiplier>(rewardMultipliersPref),
    [rewardMultipliersPref],
  );

  const visibleAccounts = useMemo(
    () => accounts.filter(account => !account.closed && !account.tombstone),
    [accounts],
  );

  const groupByAccountId = useMemo(() => {
    const next = new Map<string, HubGroup>();
    for (const account of visibleAccounts) {
      const manual = classifyAccount(account, accountCategoryMap);
      next.set(account.id, manual === 'other' ? inferAccountGroup(account) : manual);
    }
    return next;
  }, [accountCategoryMap, visibleAccounts]);

  const groupedAccounts = useMemo(() => {
    const grouped = new Map<HubGroup, AccountEntity[]>();
    for (const group of GROUPS) {
      grouped.set(group.id, []);
    }

    for (const account of visibleAccounts) {
      grouped.get(groupByAccountId.get(account.id) ?? 'other')?.push(account);
    }

    for (const list of grouped.values()) {
      list.sort((a, b) => {
        const institutionCompare = getInstitution(a).localeCompare(getInstitution(b));
        return institutionCompare || a.name.localeCompare(b.name);
      });
    }

    return grouped;
  }, [groupByAccountId, visibleAccounts]);

  const availableGroups = useMemo(
    () =>
      GROUPS.filter(group => {
        const groupAccounts = groupedAccounts.get(group.id) ?? [];
        return group.id !== 'other' || groupAccounts.length > 0;
      }),
    [groupedAccounts],
  );

  const activeGroup =
    availableGroups.find(group => group.id === activeGroupId) ??
    availableGroups[0] ??
    GROUPS[0];

  const activeAccounts = groupedAccounts.get(activeGroup.id) ?? [];
  const activeGroupTotal = activeAccounts.reduce(
    (sum, account) => sum + getAccountBalance(account),
    0,
  );
  const selectedActiveIndex = activeAccounts.findIndex(
    account => account.id === selectedAccountId,
  );

  useEffect(() => {
    if (activeGroup.id !== activeGroupId) {
      setActiveGroupId(activeGroup.id);
      return;
    }

    const selectedIsInActiveGroup =
      selectedAccountId &&
      activeAccounts.some(account => account.id === selectedAccountId);

    if (!selectedIsInActiveGroup) {
      setSelectedAccountId(activeAccounts[0]?.id ?? '');
    }
  }, [activeAccounts, activeGroup.id, activeGroupId, selectedAccountId]);

  useEffect(() => {
    walletScrollRef.current?.scrollTo({ left: 0 });
  }, [activeGroup.id]);

  const selectedAccount = useMemo(
    () => visibleAccounts.find(account => account.id === selectedAccountId),
    [selectedAccountId, visibleAccounts],
  );

  const selectedGroup = selectedAccount
    ? GROUPS.find(group => group.id === groupByAccountId.get(selectedAccount.id)) ?? GROUPS[3]
    : GROUPS[3];

  const selectedCreditDetails = useMemo(() => {
    if (!selectedAccount) {
      return undefined;
    }

    const rewardCard = findRewardCardForAccount(selectedAccount, rewardCards);

    const matchesCard = (
      item: { accountId?: string; cardName: string; issuer: string },
    ) => {
      if (item.accountId) {
        return item.accountId === selectedAccount.id;
      }
      if (!rewardCard) {
        return false;
      }

      return item.cardName === rewardCard.cardName && item.issuer === rewardCard.issuer;
    };

    const cardBenefits = benefits.filter(matchesCard);
    const cardFees = fees.filter(matchesCard);
    const cardMultipliers = rewardCard
      ? rewardMultipliers.filter(item => item.rewardCardId === rewardCard.id)
      : [];
    const totalBenefitLimit = cardBenefits.reduce(
      (sum, item) => sum + safeAmount(item.amountLimit),
      0,
    );
    const totalBenefitUsed = cardBenefits.reduce(
      (sum, item) => sum + safeAmount(item.usedAmount),
      0,
    );
    const totalFees = cardFees.reduce(
      (sum, item) => sum + safeAmount(item.annualFee),
      0,
    );

    return {
      rewardCard,
      benefits: cardBenefits,
      fees: cardFees,
      multipliers: cardMultipliers,
      availableBenefitValue: Math.max(totalBenefitLimit - totalBenefitUsed, 0),
      totalFees,
      netValue: totalBenefitLimit - totalFees,
    };
  }, [benefits, fees, rewardCards, rewardMultipliers, selectedAccount]);

  const totalBalance = visibleAccounts.reduce(
    (sum, account) => sum + getAccountBalance(account),
    0,
  );
  const walletPanelHeight = 'calc(100vh - 248px)';
  const selectedCardArt = selectedAccount
    ? getCreditCardArtForAccount(selectedAccount, rewardCards)
    : undefined;

  function handleWalletScroll() {
    const container = walletScrollRef.current;
    if (!container || activeAccounts.length === 0) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const center = containerRect.left + containerRect.width / 2;
    let closestId = '';
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const child of Array.from(container.children)) {
      const element = child as HTMLElement;
      const accountId = element.dataset.accountId;
      if (!accountId) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - center);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestId = accountId;
      }
    }

    if (closestId && closestId !== selectedAccountId) {
      setSelectedAccountId(closestId);
    }
  }

  function selectWalletAccount(accountId: string) {
    setSelectedAccountId(accountId);
    const container = walletScrollRef.current;
    const target = container?.querySelector<HTMLElement>(
      `[data-account-id="${accountId}"]`,
    );
    target?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }

  return (
    <Page header={t('Accounts Hub')}>
      <View style={{ gap: 16, paddingBottom: 24, paddingTop: 10 }}>
        <View
          style={{
            background: 'linear-gradient(135deg, #0f172a, #1d4ed8 55%, #14b8a6)',
            borderRadius: 22,
            color: '#fff',
            display: 'grid',
            gap: 8,
            overflow: 'hidden',
            padding: 18,
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              right: -70,
              top: -85,
              width: 220,
              height: 220,
              borderRadius: 999,
              background: 'rgba(255, 255, 255, 0.14)',
            }}
          />
          <Text style={{ color: '#fff', fontSize: 13, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            <Trans>Wallet-style account command center</Trans>
          </Text>
          <View
            style={{
              alignItems: 'end',
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'minmax(220px, 1fr) auto',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <View>
              <Text style={{ color: '#fff', fontSize: 30, fontWeight: 750 }}>
                {format(totalBalance, 'financial')}
              </Text>
              <Text style={{ color: 'rgba(255, 255, 255, 0.82)' }}>
                {visibleAccounts.length}{' '}
                <Trans>active accounts grouped by credit, banking, and investments.</Trans>
              </Text>
            </View>
            <View style={{ textAlign: 'right' }}>
              <Text style={{ color: 'rgba(255, 255, 255, 0.72)', fontSize: 12 }}>
                <Trans>Current wallet</Trans>
              </Text>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>
                {t(activeGroup.title)}
              </Text>
            </View>
          </View>
        </View>

        <View
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(360px, 1.1fr) minmax(340px, 0.9fr)',
            gap: 18,
            alignItems: 'stretch',
          }}
        >
          <View
            style={{
              backgroundColor: theme.tableBackground,
              border: `1px solid ${theme.tableBorder}`,
              borderRadius: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              minHeight: 420,
              overflow: 'visible',
              padding: 16,
            }}
          >
            <View
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                justifyContent: 'flex-start',
              }}
            >
              {availableGroups.map(group => {
                const groupAccounts = groupedAccounts.get(group.id) ?? [];
                const isActive = group.id === activeGroup.id;

                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setActiveGroupId(group.id)}
                    style={{
                      backgroundColor: isActive ? group.accent : theme.pageBackground,
                      border: `1px solid ${isActive ? group.accent : theme.tableBorder}`,
                      borderRadius: 999,
                      color: isActive ? '#fff' : theme.pageText,
                      cursor: 'pointer',
                      flex: '0 0 auto',
                      fontWeight: 700,
                      padding: '9px 13px',
                      width: 'auto',
                    }}
                  >
                    {t(group.title)} · {groupAccounts.length}
                  </button>
                );
              })}
            </View>

            <View
              style={{
                alignItems: 'end',
                display: 'grid',
                gap: 12,
                gridTemplateColumns: 'minmax(180px, 1fr) auto',
              }}
            >
              <View>
                <Text style={{ fontSize: 22, fontWeight: 750 }}>
                  {t(activeGroup.title)}
                </Text>
                <Text style={{ color: theme.pageTextSubdued }}>
                  {t(activeGroup.subtitle)}
                </Text>
              </View>
              <View style={{ textAlign: 'right' }}>
                <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
                  <Trans>Wallet total</Trans>
                </Text>
                <Text style={{ fontSize: 22, fontWeight: 750 }}>
                  {format(activeGroupTotal, 'financial')}
                </Text>
              </View>
            </View>

            {activeAccounts.length === 0 ? (
              <View
                style={{
                  alignItems: 'center',
                  border: `1px dashed ${theme.tableBorder}`,
                  borderRadius: 14,
                  display: 'flex',
                  justifyContent: 'center',
                  minHeight: 360,
                  padding: 16,
                }}
              >
                <Text style={{ color: theme.pageTextSubdued }}>
                  <Trans>No accounts in this group yet.</Trans>
                </Text>
              </View>
            ) : (
              <div
                ref={walletScrollRef}
                onScroll={handleWalletScroll}
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  gap: 0,
                  height: 245,
                  minHeight: 0,
                  overflowX: 'auto',
                  overflowY: 'visible',
                  overscrollBehavior: 'contain',
                  padding: '10px 120px 24px 4px',
                  scrollBehavior: 'smooth',
                  scrollPaddingLeft: 4,
                  scrollSnapType: 'x mandatory',
                }}
              >
                {activeAccounts.map((account, index) => (
                  <div
                    key={account.id}
                    data-account-id={account.id}
                    style={{
                      flex: '0 0 320px',
                      marginLeft: index === 0 ? 0 : -34,
                      position: 'relative',
                      scrollSnapAlign: 'center',
                      transition: 'transform 180ms ease, filter 180ms ease',
                      transform:
                        selectedAccount?.id === account.id
                          ? 'translateY(-2px) scale(1)'
                          : 'translateY(10px) scale(0.94)',
                      filter:
                        selectedAccount?.id === account.id
                          ? 'none'
                          : 'saturate(0.9) brightness(0.92)',
                      zIndex:
                        selectedActiveIndex >= 0
                          ? 100 - Math.abs(index - selectedActiveIndex)
                          : activeAccounts.length - index,
                    }}
                  >
                    <AccountCard
                      account={account}
                      group={activeGroup}
                      imageUrl={
                        activeGroup.id === 'credit'
                          ? getCreditCardArtForAccount(account, rewardCards)
                          : undefined
                      }
                      selected={selectedAccount?.id === account.id}
                      onSelect={() => selectWalletAccount(account.id)}
                      format={format}
                    />
                  </div>
                ))}
              </div>
            )}
          </View>

          <View
            style={{
              height: walletPanelHeight,
              minHeight: 520,
              overflow: 'hidden',
            }}
          >
            {selectedAccount ? (
              <View
                style={{
                  backgroundColor: theme.tableBackground,
                  border: `1px solid ${theme.tableBorder}`,
                  borderRadius: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  height: '100%',
                  overflowY: 'auto',
                  padding: '18px 18px 34px',
                }}
              >
                <View
                  style={{
                    aspectRatio:
                      selectedGroup.id === 'credit' && selectedCardArt
                        ? '1.586 / 1'
                        : undefined,
                    background:
                      selectedGroup.id === 'credit' && selectedCardArt
                        ? 'transparent'
                        : getAccountArt(selectedAccount, selectedGroup.accent),
                    borderRadius: 18,
                    color: '#fff',
                    flexShrink: 0,
                    minHeight:
                      selectedGroup.id === 'credit' && selectedCardArt
                        ? undefined
                        : 190,
                    overflow: 'hidden',
                    padding:
                      selectedGroup.id === 'credit' && selectedCardArt ? 0 : 20,
                    position: 'relative',
                    width:
                      selectedGroup.id === 'credit' && selectedCardArt
                        ? 'min(100%, 420px)'
                        : undefined,
                    alignSelf:
                      selectedGroup.id === 'credit' && selectedCardArt
                        ? 'center'
                        : undefined,
                  }}
                >
                  {selectedGroup.id === 'credit' && selectedCardArt && (
                    <>
                      <img
                        src={selectedCardArt}
                        alt=""
                        aria-hidden="true"
                        style={{
                          display: 'block',
                          height: '100%',
                          objectFit: 'contain',
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                        }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background:
                            'linear-gradient(180deg, rgba(2, 6, 23, 0) 0%, rgba(2, 6, 23, 0.06) 48%, rgba(2, 6, 23, 0.52) 100%)',
                        }}
                      />
                    </>
                  )}
                  <div
                    style={{
                      position: 'absolute',
                      right: -52,
                      top: -52,
                      width: 170,
                      height: 170,
                      borderRadius: 999,
                      background: 'rgba(255, 255, 255, 0.16)',
                      display:
                        selectedGroup.id === 'credit' && selectedCardArt
                          ? 'none'
                          : 'block',
                    }}
                  />
                  <View
                    style={{
                      bottom:
                        selectedGroup.id === 'credit' && selectedCardArt
                          ? 16
                          : undefined,
                      gap:
                        selectedGroup.id === 'credit' && selectedCardArt
                          ? 10
                          : 42,
                      left:
                        selectedGroup.id === 'credit' && selectedCardArt
                          ? 16
                          : undefined,
                      position:
                        selectedGroup.id === 'credit' && selectedCardArt
                          ? 'absolute'
                          : 'relative',
                      right:
                        selectedGroup.id === 'credit' && selectedCardArt
                          ? 16
                          : undefined,
                      textShadow:
                        selectedGroup.id === 'credit' && selectedCardArt
                          ? '0 2px 10px rgba(0, 0, 0, 0.65)'
                          : undefined,
                      zIndex: 1,
                    }}
                  >
                    <View>
                      <Text style={{ color: '#fff', fontSize: 13 }}>{getInstitution(selectedAccount)}</Text>
                      <Text style={{ color: '#fff', fontSize: 24, fontWeight: 750, marginTop: 4 }}>
                        {selectedAccount.name}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                      <Text style={{ color: '#fff' }}>{t(selectedGroup.title)}</Text>
                      <Text style={{ color: '#fff', fontSize: 22, fontWeight: 750 }}>
                        {format(getAccountBalance(selectedAccount), 'financial')}
                      </Text>
                    </View>
                  </View>
                </View>

                <ButtonRow>
                  <Button
                    variant="primary"
                    onPress={() => navigate(`/accounts/${selectedAccount.id}`)}
                  >
                    <Trans>Open transactions</Trans>
                  </Button>
                  {selectedGroup.id === 'credit' && (
                    <Button
                      variant="normal"
                      onPress={() => navigate('/credit-card-benefits')}
                    >
                      <Trans>Card benefits</Trans>
                    </Button>
                  )}
                </ButtonRow>

                <DetailRow label={t('Institution')} value={getInstitution(selectedAccount)} />
                <DetailRow label={t('Account group')} value={t(selectedGroup.title)} />
                <DetailRow
                  label={t('Budget status')}
                  value={selectedAccount.offbudget ? t('Off budget') : t('On budget')}
                />
                <DetailRow
                  label={t('Current balance')}
                  value={format(getAccountBalance(selectedAccount), 'financial')}
                />
                <DetailRow
                  label={t('Account id')}
                  value={<span style={{ wordBreak: 'break-all' }}>{selectedAccount.id}</span>}
                />

                {selectedGroup.id === 'credit' && (
                  <View style={{ display: 'grid', flexShrink: 0, gap: 14 }}>
                    <View
                      style={{
                        display: 'grid',
                        flexShrink: 0,
                        gridTemplateColumns:
                          'repeat(auto-fit, minmax(120px, 1fr))',
                        gap: 10,
                      }}
                    >
                      <DetailRow
                        label={t('Available benefits')}
                        value={format(
                          selectedCreditDetails?.availableBenefitValue ?? 0,
                          'financial',
                        )}
                      />
                      <DetailRow
                        label={t('Annual fees')}
                        value={format(
                          selectedCreditDetails?.totalFees ?? 0,
                          'financial',
                        )}
                      />
                      <DetailRow
                        label={t('Net card value')}
                        value={format(
                          selectedCreditDetails?.netValue ?? 0,
                          'financial',
                        )}
                      />
                    </View>

                    <View style={{ display: 'grid', flexShrink: 0, gap: 10 }}>
                      <Text style={{ fontWeight: 700 }}>
                        <Trans>Rewards</Trans>
                      </Text>
                      {selectedCreditDetails?.multipliers.length ? (
                        selectedCreditDetails.multipliers.map(multiplier => (
                          <View
                            key={multiplier.id}
                            style={{
                              borderTop: `1px solid ${theme.tableBorder}`,
                              display: 'grid',
                              flexShrink: 0,
                              gap: 8,
                              gridTemplateColumns:
                                'minmax(120px, 1fr) minmax(70px, 0.4fr)',
                              minHeight: 34,
                              paddingTop: 8,
                            }}
                          >
                            <Text>{t(multiplier.category)}</Text>
                            <Text style={{ fontWeight: 700 }}>
                              {safeNumber(multiplier.multiplier)}x
                            </Text>
                          </View>
                        ))
                      ) : (
                        <Text style={{ color: theme.pageTextSubdued }}>
                          <Trans>No reward rates linked yet.</Trans>
                        </Text>
                      )}
                    </View>

                    <View style={{ display: 'grid', flexShrink: 0, gap: 10 }}>
                      <Text style={{ fontWeight: 700 }}>
                        <Trans>Benefits</Trans>
                      </Text>
                      {selectedCreditDetails?.benefits.length ? (
                        selectedCreditDetails.benefits.map(benefit => {
                          const remaining = Math.max(
                            safeAmount(benefit.amountLimit) -
                              safeAmount(benefit.usedAmount),
                            0,
                          );

                          return (
                            <View
                              key={benefit.id}
                              style={{
                                borderTop: `1px solid ${theme.tableBorder}`,
                                display: 'grid',
                                flexShrink: 0,
                                gap: 8,
                                gridTemplateColumns:
                                  'minmax(140px, 1fr) minmax(90px, 0.45fr)',
                                minHeight: 34,
                                paddingTop: 8,
                              }}
                            >
                              <Text>{benefit.benefitName}</Text>
                              <Text style={{ fontWeight: 700 }}>
                                {format(remaining, 'financial')}
                              </Text>
                            </View>
                          );
                        })
                      ) : (
                        <Text style={{ color: theme.pageTextSubdued }}>
                          <Trans>No benefits linked yet.</Trans>
                        </Text>
                      )}
                    </View>

                    <View style={{ display: 'grid', flexShrink: 0, gap: 10 }}>
                      <Text style={{ fontWeight: 700 }}>
                        <Trans>Fees</Trans>
                      </Text>
                      {selectedCreditDetails?.fees.length ? (
                        selectedCreditDetails.fees.map(fee => (
                          <View
                            key={fee.id}
                            style={{
                              borderTop: `1px solid ${theme.tableBorder}`,
                              display: 'grid',
                              flexShrink: 0,
                              gap: 8,
                              gridTemplateColumns:
                                'minmax(120px, 1fr) minmax(90px, 0.45fr)',
                              minHeight: 34,
                              paddingTop: 8,
                            }}
                          >
                            <Text>{fee.feeDueDate || t('No date')}</Text>
                            <Text style={{ fontWeight: 700 }}>
                              {format(fee.annualFee, 'financial')}
                            </Text>
                          </View>
                        ))
                      ) : (
                        <Text style={{ color: theme.pageTextSubdued }}>
                          <Trans>No annual fee linked yet.</Trans>
                        </Text>
                      )}
                    </View>
                  </View>
                )}

                {selectedGroup.id === 'bank' && (
                  <View style={{ display: 'grid', flexShrink: 0, gap: 14 }}>
                    <Text style={{ fontWeight: 700 }}>
                      <Trans>Banking dashboard</Trans>
                    </Text>
                    <View
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          'repeat(auto-fit, minmax(120px, 1fr))',
                        gap: 10,
                      }}
                    >
                      <MetricTile
                        label={t('Cash position')}
                        value={format(getAccountBalance(selectedAccount), 'financial')}
                        tone={theme.noticeText}
                      />
                      <MetricTile
                        label={t('Budget status')}
                        value={selectedAccount.offbudget ? t('Off budget') : t('On budget')}
                      />
                      <MetricTile
                        label={t('Institution')}
                        value={getInstitution(selectedAccount)}
                      />
                    </View>
                    <View style={{ display: 'grid', flexShrink: 0, gap: 12 }}>
                      <Text style={{ fontWeight: 700 }}>
                        <Trans>Cashflow tools</Trans>
                      </Text>
                      <InfoBlock title={<Trans>Recurring income and bills</Trans>}>
                        <Trans>
                          We can surface paychecks, mortgage/rent, utilities,
                          transfers, and large cash movements here.
                        </Trans>
                      </InfoBlock>
                      <InfoBlock title={<Trans>Recent activity</Trans>}>
                        <Trans>
                          Open transactions to review this account's latest cash
                          activity.
                        </Trans>
                      </InfoBlock>
                    </View>
                  </View>
                )}

                {selectedGroup.id === 'investment' && (
                  <View style={{ display: 'grid', flexShrink: 0, gap: 14 }}>
                    <Text style={{ fontWeight: 700 }}>
                      <Trans>Investment dashboard</Trans>
                    </Text>
                    <View
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          'repeat(auto-fit, minmax(120px, 1fr))',
                        gap: 10,
                      }}
                    >
                      <MetricTile
                        label={t('Portfolio value')}
                        value={format(getAccountBalance(selectedAccount), 'financial')}
                        tone={theme.noticeText}
                      />
                      <MetricTile
                        label={t('Account type')}
                        value={t(selectedGroup.title)}
                      />
                      <MetricTile
                        label={t('Institution')}
                        value={getInstitution(selectedAccount)}
                      />
                    </View>
                    <View style={{ display: 'grid', flexShrink: 0, gap: 12 }}>
                      <Text style={{ fontWeight: 700 }}>
                        <Trans>Portfolio tools</Trans>
                      </Text>
                      <InfoBlock title={<Trans>Holdings and allocation</Trans>}>
                        <Trans>
                          Once SimpleFIN holdings are available, this section can
                          show positions, allocation, and concentration.
                        </Trans>
                      </InfoBlock>
                      <InfoBlock title={<Trans>Performance and movement</Trans>}>
                        <Trans>
                          We can track deposits, withdrawals, balance changes,
                          and portfolio movement here.
                        </Trans>
                      </InfoBlock>
                    </View>
                  </View>
                )}
              </View>
            ) : (
              <View
                style={{
                  backgroundColor: theme.tableBackground,
                  border: `1px solid ${theme.tableBorder}`,
                  borderRadius: 18,
                  height: '100%',
                  padding: 18,
                }}
              >
                <Text style={{ color: theme.pageTextSubdued }}>
                  <Trans>No accounts to show yet.</Trans>
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Page>
  );
}
