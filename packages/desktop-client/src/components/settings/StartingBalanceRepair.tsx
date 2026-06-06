import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import { q } from '@actual-app/core/shared/query';
import type { AccountEntity } from '@actual-app/core/types/models';
import { v4 as uuidv4 } from 'uuid';

import { addNotification } from '#notifications/notificationsSlice';
import { aqlQuery } from '#queries/aqlQuery';
import { useDispatch } from '#redux';

import { Setting } from './UI';

type TxLite = {
  id: string;
  amount: number;
  starting_balance_flag?: boolean | null;
};

export function StartingBalanceRepairSettings() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [isFixing, setIsFixing] = useState(false);

  const onRepair = async () => {
    if (isFixing) return;
    setIsFixing(true);
    let fixed = 0;

    try {
      const accounts: AccountEntity[] = await send('accounts-get');

      for (const account of accounts) {
        if (!account.account_id || typeof account.balance_current !== 'number') {
          continue;
        }

        const { data } = await aqlQuery(
          q('transactions')
            .filter({ account: account.id })
            .select(['id', 'amount', 'starting_balance_flag']),
        );

        const txs: TxLite[] = (data ?? []) as TxLite[];
        const startingTx = txs.find(tx => Boolean(tx.starting_balance_flag));
        if (!startingTx) {
          continue;
        }

        const nonStartingSum = txs
          .filter(tx => tx.id !== startingTx.id)
          .reduce((sum, tx) => sum + (tx.amount || 0), 0);

        const correctedStarting = account.balance_current - nonStartingSum;
        if (correctedStarting === startingTx.amount) {
          continue;
        }

        await send('transactions-batch-update', {
          updated: [{ id: startingTx.id, amount: correctedStarting }],
        });
        fixed += 1;
      }

      dispatch(
        addNotification({
          notification: {
            id: uuidv4(),
            type: 'message',
            message: t('Starting balances fixed for {{count}} account(s).', {
              count: fixed,
            }),
          },
        }),
      );
    } catch (err) {
      dispatch(
        addNotification({
          notification: {
            id: uuidv4(),
            type: 'error',
            message: t('Failed to repair starting balances.'),
            pre: err instanceof Error ? err.message : String(err),
          },
        }),
      );
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <Setting>
      <Text>
        <Trans>
          One-click fix for linked accounts where starting balance was filled
          using current balance on a past date.
        </Trans>
      </Text>
      <View>
        <Button variant="primary" onPress={onRepair} isDisabled={isFixing}>
          {isFixing ? t('Fixing...') : t('Fix Starting Balances')}
        </Button>
      </View>
    </Setting>
  );
}
