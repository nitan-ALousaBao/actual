import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import type {
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';
import { useQueryClient } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';

import { categoryQueries } from '#budget/queries';
import { addNotification } from '#notifications/notificationsSlice';
import { useDispatch } from '#redux';

import { Setting } from './UI';

const CATEGORY_PRESET: Record<string, string[]> = {
  Housing: [
    'Rent / Mortgage',
    'Property Tax',
    'HOA',
    'Home Insurance',
    'Utilities - Electric',
    'Utilities - Gas',
    'Utilities - Water/Sewer',
    'Internet',
    'Home Maintenance',
    'Furnishings',
  ],
  Transportation: [
    'Car Payment',
    'Auto Insurance',
    'Fuel',
    'Parking & Tolls',
    'Public Transit',
    'Rideshare',
    'Vehicle Maintenance',
    'Registration & DMV',
  ],
  Food: ['Groceries', 'Dining Out', 'Coffee & Tea', 'Takeout / Delivery'],
  Health: ['Medical', 'Dental', 'Vision', 'Pharmacy', 'Health Insurance', 'Fitness / Gym'],
  Personal: ['Shopping', 'Clothing', 'Personal Care', 'Pets', 'Education'],
  'Bills & Subscriptions': [
    'Mobile Phone',
    'Streaming',
    'Software / Cloud',
    'Memberships',
    'Banking Fees',
    'Credit Card Interest',
  ],
  Travel: ['Flights', 'Hotels', 'Car Rental', 'Travel Food', 'Travel Activities'],
  Income: [
    'Salary',
    'Bonus',
    'Reimbursement',
    'Interest Income',
    'Dividend Income',
    'Tax Refund',
    'Other Income',
  ],
  'Savings & Investing': [
    'Emergency Fund',
    'Brokerage Contribution',
    '401k Contribution',
    'IRA Contribution',
    'HSA Contribution',
    'Investment Fees',
  ],
  'Transfers & Debt': [
    'Credit Card Payment',
    'Loan Payment',
    'Transfer: Internal',
    'Transfer: Checking <-> Savings',
    'Transfer: Brokerage <-> Bank',
  ],
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function USPresetSettings() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  const [isApplying, setIsApplying] = useState(false);

  const applyPreset = async () => {
    if (isApplying) return;
    setIsApplying(true);
    let createdGroups = 0;
    let createdCategories = 0;

    try {
      const categoriesRes = await send('get-categories');
      let grouped: CategoryGroupEntity[] = categoriesRes.grouped ?? [];
      let list: CategoryEntity[] = categoriesRes.list ?? [];

      for (const [groupName, categoryNames] of Object.entries(CATEGORY_PRESET)) {
        let group = grouped.find(g => normalize(g.name) === normalize(groupName));
        if (!group) {
          const groupId = await send('category-group-create', { name: groupName });
          createdGroups += 1;
          group = {
            id: groupId,
            name: groupName,
            is_income: groupName === 'Income',
            hidden: false,
            sort_order: 0,
            tombstone: false,
            categories: [],
          };
          grouped = [...grouped, group];
        }

        for (const categoryName of categoryNames) {
          const exists = list.some(
            c =>
              c.group === group.id &&
              normalize(c.name) === normalize(categoryName),
          );
          if (exists) continue;

          await send('category-create', {
            name: categoryName,
            groupId: group.id,
            isIncome: groupName === 'Income',
            hidden: false,
          });
          createdCategories += 1;
        }
      }

      void queryClient.invalidateQueries({ queryKey: categoryQueries.lists() });

      dispatch(
        addNotification({
          notification: {
            id: uuidv4(),
            type: 'message',
            message: t(
              'US category preset applied. Added {{groups}} groups and {{categories}} categories.',
              {
                groups: createdGroups,
                categories: createdCategories,
              },
            ),
          },
        }),
      );
    } catch (error) {
      dispatch(
        addNotification({
          notification: {
            id: uuidv4(),
            type: 'error',
            message: t('Failed to apply US preset.'),
            pre: error instanceof Error ? error.message : String(error),
          },
        }),
      );
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Setting>
      <Text>
        <Trans>
          Install a US-focused starter pack for categories only.
        </Trans>
      </Text>
      <View>
        <Button variant="primary" onPress={applyPreset} isDisabled={isApplying}>
          {isApplying ? t('Applying...') : t('Install US Categories')}
        </Button>
      </View>
    </Setting>
  );
}
