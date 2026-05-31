// @ts-strict-ignore
import React, { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { AlignedText } from '@actual-app/components/aligned-text';
import { Button } from '@actual-app/components/button';
import {
  SvgArrowButtonDown1,
  SvgArrowButtonUp1,
} from '@actual-app/components/icons/v2';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { Input } from '@actual-app/components/input';
import { Menu } from '@actual-app/components/menu';
import { Popover } from '@actual-app/components/popover';
import { SpaceBetween } from '@actual-app/components/space-between';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { Tooltip } from '@actual-app/components/tooltip';
import { View } from '@actual-app/components/view';
import type { AccountEntity } from '@actual-app/core/types/models';
import { css, cx } from '@emotion/css';

import { useReopenAccountMutation, useUpdateAccountMutation } from '#accounts';
import { BalanceHistoryGraph } from '#components/accounts/BalanceHistoryGraph';
import { Link } from '#components/common/Link';
import { Notes } from '#components/Notes';
import { DropHighlight, useDraggable, useDroppable } from '#components/sort';
import type { OnDragChangeCallback, OnDropCallback } from '#components/sort';
import { CellValue } from '#components/spreadsheet/CellValue';
import { useContextMenu } from '#hooks/useContextMenu';
import { useDragRef } from '#hooks/useDragRef';
import { useFormat } from '#hooks/useFormat';
import { useIsTestEnv } from '#hooks/useIsTestEnv';
import { useNotes } from '#hooks/useNotes';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { openAccountCloseModal } from '#modals/modalsSlice';
import { transactions } from '#queries';
import { liveQuery } from '#queries/liveQuery';
import { useDispatch } from '#redux';
import type { Binding, SheetFields } from '#spreadsheet';

export const accountNameStyle: CSSProperties = {
  marginTop: -2,
  marginBottom: 2,
  paddingTop: 4,
  paddingBottom: 4,
  paddingRight: 15,
  paddingLeft: 10,
  textDecoration: 'none',
  color: theme.sidebarItemText,
  ':hover': { backgroundColor: theme.sidebarItemBackgroundHover },
  ...styles.smallText,
};

type AccountProps<FieldName extends SheetFields<'account'>> = {
  name: string;
  to: string;
  query: Binding<'account', FieldName>;
  account?: AccountEntity;
  connected?: boolean;
  pending?: boolean;
  failed?: boolean;
  updated?: boolean;
  style?: CSSProperties;
  outerStyle?: CSSProperties;
  onDragChange?: OnDragChangeCallback<{ id: string }>;
  onDrop?: OnDropCallback;
  titleAccount?: boolean;
  isExactPathMatch?: boolean;
  balanceTestId?: string;
  displayBalance?: number | null;
  onSetCategory?: (
    accountId: AccountEntity['id'],
    category: 'bank' | 'credit' | 'investment' | 'other' | null,
  ) => void;
};

type StartingBalanceInfo = {
  date: string;
  amount: number;
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

export function Account<FieldName extends SheetFields<'account'>>({
  name,
  account,
  connected,
  pending = false,
  failed,
  updated,
  to,
  query,
  style,
  outerStyle,
  onDragChange,
  onDrop,
  titleAccount,
  isExactPathMatch,
  balanceTestId,
  displayBalance,
  onSetCategory,
}: AccountProps<FieldName>) {
  const isTestEnv = useIsTestEnv();
  const { t } = useTranslation();
  const format = useFormat();
  const type = account
    ? account.closed
      ? 'account-closed'
      : account.offbudget
        ? 'account-offbudget'
        : 'account-onbudget'
    : 'title';

  const triggerRef = useRef(null);
  const { setMenuOpen, menuOpen, handleContextMenu, position } =
    useContextMenu();

  const { dragRef } = useDraggable({
    type,
    onDragChange,
    item: { id: account && account.id },
    canDrag: account != null,
  });
  const handleDragRef = useDragRef(dragRef);

  const { dropRef, dropPos } = useDroppable({
    types: account ? [type] : [],
    id: account && account.id,
    onDrop,
  });

  const [showBalanceHistory, setShowBalanceHistory] = useSyncedPref(
    `side-nav.show-balance-history-${account?.id}`,
  );

  const dispatch = useDispatch();

  const [isEditing, setIsEditing] = useState(false);

  const accountNote = useNotes(`account-${account?.id}`);
  const isTouchDevice =
    window.matchMedia('(hover: none)').matches ||
    window.matchMedia('(pointer: coarse)').matches;
  const needsTooltip = !!account?.id && !isTouchDevice;
  const reopenAccount = useReopenAccountMutation();
  const updateAccount = useUpdateAccountMutation();
  const startingBalanceInfo = useStartingBalanceInfo(account?.id);

  const balanceCell = (() => {
    if (typeof displayBalance === 'number') {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text>{format(displayBalance, 'financial')}</Text>
          <Text style={{ color: theme.pageTextSubdued, fontSize: 10 }}>[C]</Text>
        </View>
      );
    }

    if (startingBalanceInfo && typeof startingBalanceInfo.amount === 'number') {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text>{format(startingBalanceInfo.amount, 'financial')}</Text>
          <Text style={{ color: theme.pageTextSubdued, fontSize: 10 }}>[S]</Text>
        </View>
      );
    }

    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <CellValue binding={query} type="financial" />
        <Text style={{ color: theme.pageTextSubdued, fontSize: 10 }}>[L]</Text>
      </View>
    );
  })();

  const accountRow = (
    <View
      innerRef={dropRef}
      style={{ flexShrink: 0, ...outerStyle }}
      onContextMenu={needsTooltip ? handleContextMenu : undefined}
    >
      <View innerRef={triggerRef}>
        <DropHighlight pos={dropPos} />
        <View innerRef={handleDragRef}>
          <Link
            variant="internal"
            to={to}
            isDisabled={isEditing}
            isExactPathMatch={isExactPathMatch}
            style={{
              ...accountNameStyle,
              ...style,
              position: 'relative',
              borderLeft: '4px solid transparent',
              ...(updated && {
                fontWeight: 700,
                color: theme.sidebarItemTextUpdated,
              }),
            }}
            activeStyle={{
              borderColor: theme.sidebarItemAccentSelected,
              color: theme.sidebarItemTextSelected,
              // This is kind of a hack, but we don't ever want the account
              // that the user is looking at to be "bolded" which means it
              // has unread transactions. The system does mark is read and
              // unbolds it, but it still "flashes" bold so this just
              // ignores it if it's active
              fontWeight: (style && style.fontWeight) || 'normal',
              '& .dot': {
                backgroundColor: theme.sidebarItemAccentSelected,
                transform: 'translateX(-4.5px)',
              },
            }}
          >
            <View
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <div
                className={cx(
                  'dot',
                  css({
                    marginRight: 3,
                    width: 5,
                    height: 5,
                    borderRadius: 5,
                    backgroundColor: pending
                      ? theme.sidebarItemBackgroundPending
                      : failed
                        ? theme.sidebarItemBackgroundFailed
                        : theme.sidebarItemBackgroundPositive,
                    marginLeft: 2,
                    transition: 'transform .3s',
                    opacity: connected ? 1 : 0,
                  }),
                )}
              />
            </View>

            <AlignedText
              style={
                titleAccount && {
                  borderBottom: `1.5px solid rgba(255,255,255,0.4)`,
                  paddingBottom: '3px',
                }
              }
              left={
                isEditing ? (
                  <InitialFocus>
                    <Input
                      style={{
                        padding: 0,
                        width: '100%',
                      }}
                      onBlur={() => setIsEditing(false)}
                      onEnter={newAccountName => {
                        if (newAccountName.trim() !== '') {
                          updateAccount.mutate({
                            account: {
                              ...account,
                              name: newAccountName,
                            },
                          });
                        }
                        setIsEditing(false);
                      }}
                      onEscape={() => setIsEditing(false)}
                      defaultValue={name}
                    />
                  </InitialFocus>
                ) : (
                  name
                )
              }
              right={
                balanceTestId ? (
                  <View data-testid={balanceTestId}>{balanceCell}</View>
                ) : (
                  balanceCell
                )
              }
            />
          </Link>
          {account && (
            <Popover
              triggerRef={triggerRef}
              placement="bottom start"
              isOpen={menuOpen}
              onOpenChange={() => setMenuOpen(false)}
              style={{ width: 200, margin: 1 }}
              isNonModal
              {...position}
            >
              <Menu
                onMenuSelect={type => {
                  switch (type) {
                    case 'close': {
                      void dispatch(
                        openAccountCloseModal({ accountId: account.id }),
                      );
                      break;
                    }
                    case 'reopen': {
                      reopenAccount.mutate({ id: account.id });
                      break;
                    }
                    case 'rename': {
                      setIsEditing(true);
                      break;
                    }
                    case 'set-category-bank': {
                      if (account.id) {
                        onSetCategory?.(account.id, 'bank');
                      }
                      break;
                    }
                    case 'set-category-credit': {
                      if (account.id) {
                        onSetCategory?.(account.id, 'credit');
                      }
                      break;
                    }
                    case 'set-category-investment': {
                      if (account.id) {
                        onSetCategory?.(account.id, 'investment');
                      }
                      break;
                    }
                    case 'set-category-other': {
                      if (account.id) {
                        onSetCategory?.(account.id, 'other');
                      }
                      break;
                    }
                    case 'clear-category': {
                      if (account.id) {
                        onSetCategory?.(account.id, null);
                      }
                      break;
                    }
                    default: {
                      throw new Error(
                        `Unrecognized menu option: ${String(type)}`,
                      );
                    }
                  }
                  setMenuOpen(false);
                }}
                items={[
                  { name: 'rename', text: t('Rename') },
                  Menu.line,
                  { name: 'set-category-bank', text: t('Set category: Bank') },
                  {
                    name: 'set-category-credit',
                    text: t('Set category: Credit Card'),
                  },
                  {
                    name: 'set-category-investment',
                    text: t('Set category: Investment'),
                  },
                  { name: 'set-category-other', text: t('Set category: Other') },
                  { name: 'clear-category', text: t('Clear custom category') },
                  Menu.line,
                  account.closed
                    ? { name: 'reopen', text: t('Reopen') }
                    : { name: 'close', text: t('Close') },
                ]}
              />
            </Popover>
          )}
        </View>
      </View>
    </View>
  );

  if (!needsTooltip || isTestEnv) {
    return accountRow;
  }

  return (
    <Tooltip
      content={
        <View
          style={{
            padding: 10,
          }}
        >
          <SpaceBetween
            gap={5}
            style={{
              justifyContent: 'space-between',
              '& .hover-visible': {
                opacity: 0,
                transition: 'opacity .25s',
              },
              '&:hover .hover-visible': {
                opacity: 1,
              },
            }}
          >
            <Text
              style={{
                fontWeight: 'bold',
              }}
            >
              {name}
            </Text>
            <Button
              aria-label={t('Toggle balance history')}
              variant="bare"
              onClick={() =>
                setShowBalanceHistory(
                  showBalanceHistory === 'true' ? 'false' : 'true',
                )
              }
              className="hover-visible"
            >
              <SpaceBetween gap={3}>
                {showBalanceHistory === 'true' ? (
                  <SvgArrowButtonUp1 width={10} height={10} />
                ) : (
                  <SvgArrowButtonDown1 width={10} height={10} />
                )}
              </SpaceBetween>
            </Button>
          </SpaceBetween>
          {showBalanceHistory === 'true' && account && (
            <BalanceHistoryGraph
              accountId={account.id}
              style={{ minWidth: 350, minHeight: 70 }}
            />
          )}
          {accountNote && (
            <Notes
              getStyle={() => ({
                borderTop: `1px solid ${theme.tableBorder}`,
                padding: 0,
                paddingTop: '0.5rem',
                marginTop: '0.5rem',
              })}
              notes={accountNote}
            />
          )}
        </View>
      }
      style={{ ...styles.tooltip, borderRadius: '0px 5px 5px 0px' }}
      placement="right top"
      triggerProps={{
        delay: 1000,
        closeDelay: 250,
        isDisabled: menuOpen,
      }}
    >
      {accountRow}
    </Tooltip>
  );
}
