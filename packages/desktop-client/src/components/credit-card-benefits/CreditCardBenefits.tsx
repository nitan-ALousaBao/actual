import { useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Select } from '@actual-app/components/select';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import { v4 as uuidv4 } from 'uuid';

import { Link } from '#components/common/Link';
import { Checkbox } from '#components/forms';
import { Page } from '#components/Page';
import { useAccounts } from '#hooks/useAccounts';
import { useFormat } from '#hooks/useFormat';
import { useSyncedPref } from '#hooks/useSyncedPref';

import type {
  AccountCategoryMap,
  AccountGroup,
} from '../accounts/accountClassification';
import { classifyAccount } from '../accounts/accountClassification';
import { findCardArt } from './cardArt';

type BenefitPeriod =
  | 'monthly'
  | 'quarterly'
  | 'semiannual'
  | 'annual'
  | 'one-time';

type BenefitResetType = 'calendar' | 'anniversary' | 'custom';

type CreditCardBenefit = {
  id: string;
  accountId?: string;
  cardName: string;
  issuer: string;
  benefitName: string;
  amountLimit: number;
  usedAmount: number;
  period: BenefitPeriod;
  resetDate: string;
  resetType?: BenefitResetType;
  anchorDate?: string;
  autoReset?: boolean;
  enrollmentRequired: boolean;
  enrolled: boolean;
  sourceUrl: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type CreditCardFee = {
  id: string;
  accountId?: string;
  cardName: string;
  issuer: string;
  annualFee: number;
  feeDueDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type RewardCard = {
  id: string;
  accountId?: string;
  cardName: string;
  issuer: string;
  imageUrl?: string;
  pointSystemId?: string;
  pointsCurrency: string;
  pointValueCents: number;
  createdAt: string;
  updatedAt: string;
};

type RewardPointSystem = {
  id: string;
  name: string;
  pointValueCents: number;
  createdAt: string;
  updatedAt: string;
};

type RewardMultiplier = {
  id: string;
  rewardCardId: string;
  category: string;
  multiplier: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type DeletedRewardCardSnapshot = {
  card: RewardCard;
  multipliers: RewardMultiplier[];
};

type RewardRecommendation = {
  category: string;
  best?: {
    card: RewardCard;
    multiplier: number;
    effectiveRate: number;
    sourceCategory: string;
    notes: string;
  };
};

type CardTemplate = {
  id: string;
  label: string;
  aliases: string[];
  issuer: string;
  cardName: string;
  pointsCurrency: string;
  pointValueCents: number;
  annualFee?: number;
  rewards: Array<{
    category: string;
    multiplier: number;
    notes?: string;
  }>;
  benefits: Array<{
    benefitName: string;
    amountLimit: number;
    period: BenefitPeriod;
    enrollmentRequired?: boolean;
    notes?: string;
  }>;
};

type BenefitDraft = Omit<CreditCardBenefit, 'id' | 'createdAt' | 'updatedAt'>;
type FeeDraft = Omit<CreditCardFee, 'id' | 'createdAt' | 'updatedAt'>;
type RewardCardDraft = Omit<RewardCard, 'id' | 'createdAt' | 'updatedAt'>;
type RewardPointSystemDraft = {
  name: string;
  pointValueCents: string;
};
type RewardMultiplierDraft = Omit<
  RewardMultiplier,
  'id' | 'createdAt' | 'updatedAt'
>;

const EMPTY_DRAFT: BenefitDraft = {
  accountId: '',
  cardName: '',
  issuer: '',
  benefitName: '',
  amountLimit: 0,
  usedAmount: 0,
  period: 'annual',
  resetDate: monthUtils.currentDay(),
  resetType: 'custom',
  anchorDate: '',
  autoReset: true,
  enrollmentRequired: false,
  enrolled: false,
  sourceUrl: '',
  notes: '',
};

const EMPTY_FEE_DRAFT: FeeDraft = {
  accountId: '',
  cardName: '',
  issuer: '',
  annualFee: 0,
  feeDueDate: monthUtils.currentDay(),
  notes: '',
};

const EMPTY_REWARD_CARD_DRAFT: RewardCardDraft = {
  accountId: '',
  cardName: '',
  issuer: '',
  imageUrl: '',
  pointSystemId: '',
  pointsCurrency: 'points',
  pointValueCents: 1,
};

const EMPTY_POINT_SYSTEM_DRAFT: RewardPointSystemDraft = {
  name: '',
  pointValueCents: '1',
};

const EMPTY_MULTIPLIER_DRAFT: RewardMultiplierDraft = {
  rewardCardId: '',
  category: 'Everything else',
  multiplier: 1,
  notes: '',
};

const PERIOD_OPTIONS: ReadonlyArray<readonly [BenefitPeriod, string]> = [
  ['monthly', 'Monthly'],
  ['quarterly', 'Quarterly'],
  ['semiannual', 'Semiannual'],
  ['annual', 'Annual'],
  ['one-time', 'One-time'],
];

const RESET_TYPE_OPTIONS: ReadonlyArray<readonly [BenefitResetType, string]> = [
  ['calendar', 'Calendar cycle'],
  ['anniversary', 'Card anniversary'],
  ['custom', 'Custom next reset'],
];

const SPEND_CATEGORY_OPTIONS = [
  'Everything else',
  'Dining',
  'Groceries',
  'Gas',
  'Travel',
  'Flights',
  'Hotels',
  'Transit / rideshare',
  'Online shopping',
  'Drugstores',
  'Wholesale clubs',
  'Utilities',
  'Entertainment',
] as const;

const CARD_TEMPLATES: CardTemplate[] = [
  {
    id: 'flat-2-cashback',
    label: 'Flat 2% cash back card',
    aliases: ['2% cash', '2 cash', 'double cash', 'active cash'],
    issuer: '',
    cardName: 'Flat 2% Cash Back Card',
    pointsCurrency: 'Cash back',
    pointValueCents: 1,
    rewards: [{ category: 'Everything else', multiplier: 2 }],
    benefits: [],
  },
  {
    id: 'dining-grocery-cashback',
    label: 'Dining and grocery cash back card',
    aliases: ['dining grocery', 'grocery cash', 'savor', 'blue cash'],
    issuer: '',
    cardName: 'Dining & Grocery Cash Back Card',
    pointsCurrency: 'Cash back',
    pointValueCents: 1,
    annualFee: 9500,
    rewards: [
      { category: 'Everything else', multiplier: 1 },
      { category: 'Dining', multiplier: 3 },
      { category: 'Groceries', multiplier: 3 },
      { category: 'Gas', multiplier: 3 },
    ],
    benefits: [
      {
        benefitName: 'Annual statement credit',
        amountLimit: 10000,
        period: 'annual',
        notes: 'Starter placeholder. Adjust to the issuer terms.',
      },
    ],
  },
  {
    id: 'travel-points-card',
    label: 'Travel points card',
    aliases: ['travel', 'sapphire preferred', 'venture', 'autograph'],
    issuer: '',
    cardName: 'Travel Points Card',
    pointsCurrency: 'Points',
    pointValueCents: 1.5,
    annualFee: 9500,
    rewards: [
      { category: 'Everything else', multiplier: 1 },
      { category: 'Dining', multiplier: 3 },
      { category: 'Travel', multiplier: 2 },
      {
        category: 'Flights',
        multiplier: 5,
        notes: 'Portal or direct booking rules vary by card.',
      },
      {
        category: 'Hotels',
        multiplier: 5,
        notes: 'Portal or direct booking rules vary by card.',
      },
    ],
    benefits: [
      {
        benefitName: 'Travel credit',
        amountLimit: 5000,
        period: 'annual',
        notes: 'Starter placeholder. Adjust amount and eligible merchants.',
      },
      {
        benefitName: 'Trip protection / insurance',
        amountLimit: 0,
        period: 'annual',
        notes: 'Track as a non-cash benefit if useful.',
      },
    ],
  },
  {
    id: 'premium-travel-card',
    label: 'Premium travel card',
    aliases: ['sapphire reserve', 'platinum', 'venture x', 'premium travel'],
    issuer: '',
    cardName: 'Premium Travel Card',
    pointsCurrency: 'Points',
    pointValueCents: 1.5,
    annualFee: 55000,
    rewards: [
      { category: 'Everything else', multiplier: 1 },
      { category: 'Travel', multiplier: 3 },
      { category: 'Flights', multiplier: 5 },
      { category: 'Hotels', multiplier: 5 },
      { category: 'Dining', multiplier: 3 },
    ],
    benefits: [
      {
        benefitName: 'Annual travel credit',
        amountLimit: 30000,
        period: 'annual',
        notes: 'Starter placeholder. Adjust to your card terms.',
      },
      {
        benefitName: 'Global Entry / TSA PreCheck credit',
        amountLimit: 10000,
        period: 'annual',
        notes: 'Usually available every several years; adjust reset date.',
      },
      {
        benefitName: 'Airport lounge access',
        amountLimit: 0,
        period: 'annual',
        enrollmentRequired: true,
        notes: 'Track enrollment/status; cash value is subjective.',
      },
    ],
  },
  {
    id: 'rotating-5-cashback',
    label: 'Rotating 5% category card',
    aliases: ['freedom flex', 'discover it', 'rotating', 'quarterly'],
    issuer: '',
    cardName: 'Rotating 5% Card',
    pointsCurrency: 'Cash back',
    pointValueCents: 1,
    rewards: [
      { category: 'Everything else', multiplier: 1 },
      {
        category: 'Groceries',
        multiplier: 5,
        notes: 'Replace with this quarter’s active category.',
      },
      {
        category: 'Gas',
        multiplier: 5,
        notes: 'Replace with this quarter’s active category.',
      },
    ],
    benefits: [
      {
        benefitName: 'Quarterly category activation',
        amountLimit: 0,
        period: 'quarterly',
        enrollmentRequired: true,
        notes: 'Use this as a reminder to activate rotating categories.',
      },
    ],
  },
  {
    id: 'chase-freedom-unlimited',
    label: 'Chase Freedom Unlimited',
    aliases: ['chase freedom unlimited', 'freedom unlimited', 'cfu'],
    issuer: 'Chase',
    cardName: 'Freedom Unlimited',
    pointsCurrency: 'Ultimate Rewards',
    pointValueCents: 1,
    rewards: [
      { category: 'Everything else', multiplier: 1.5 },
      { category: 'Dining', multiplier: 3 },
      { category: 'Drugstores', multiplier: 3 },
      {
        category: 'Travel',
        multiplier: 5,
        notes: 'Usually tied to issuer travel portal. Verify terms.',
      },
    ],
    benefits: [],
  },
  {
    id: 'chase-freedom-flex',
    label: 'Chase Freedom Flex',
    aliases: ['chase freedom flex', 'freedom flex', 'cff'],
    issuer: 'Chase',
    cardName: 'Freedom Flex',
    pointsCurrency: 'Ultimate Rewards',
    pointValueCents: 1,
    rewards: [
      { category: 'Everything else', multiplier: 1 },
      { category: 'Dining', multiplier: 3 },
      { category: 'Drugstores', multiplier: 3 },
      {
        category: 'Travel',
        multiplier: 5,
        notes: 'Usually tied to issuer travel portal. Verify terms.',
      },
      {
        category: 'Groceries',
        multiplier: 5,
        notes: 'Placeholder for rotating quarterly categories.',
      },
    ],
    benefits: [
      {
        benefitName: 'Quarterly category activation',
        amountLimit: 0,
        period: 'quarterly',
        enrollmentRequired: true,
        notes: 'Activate and replace category rates each quarter.',
      },
    ],
  },
  {
    id: 'chase-sapphire-preferred',
    label: 'Chase Sapphire Preferred',
    aliases: ['chase sapphire preferred', 'sapphire preferred', 'csp'],
    issuer: 'Chase',
    cardName: 'Sapphire Preferred',
    pointsCurrency: 'Ultimate Rewards',
    pointValueCents: 1.25,
    annualFee: 9500,
    rewards: [
      { category: 'Everything else', multiplier: 1 },
      { category: 'Dining', multiplier: 3 },
      { category: 'Travel', multiplier: 2 },
      {
        category: 'Hotels',
        multiplier: 5,
        notes: 'Usually tied to issuer travel portal. Verify terms.',
      },
      {
        category: 'Online shopping',
        multiplier: 3,
        notes: 'Online grocery terms can exclude some merchants.',
      },
    ],
    benefits: [
      {
        benefitName: 'Hotel credit',
        amountLimit: 5000,
        period: 'annual',
        notes: 'Verify booking channel and eligibility.',
      },
    ],
  },
  {
    id: 'chase-sapphire-reserve',
    label: 'Chase Sapphire Reserve',
    aliases: ['chase sapphire reserve', 'sapphire reserve', 'csr'],
    issuer: 'Chase',
    cardName: 'Sapphire Reserve',
    pointsCurrency: 'Ultimate Rewards',
    pointValueCents: 1.5,
    annualFee: 55000,
    rewards: [
      { category: 'Everything else', multiplier: 1 },
      { category: 'Dining', multiplier: 3 },
      { category: 'Travel', multiplier: 3 },
      {
        category: 'Flights',
        multiplier: 5,
        notes: 'Usually tied to issuer travel portal. Verify terms.',
      },
      {
        category: 'Hotels',
        multiplier: 10,
        notes: 'Usually tied to issuer travel portal. Verify terms.',
      },
    ],
    benefits: [
      {
        benefitName: 'Travel credit',
        amountLimit: 30000,
        period: 'annual',
        notes: 'Verify eligible travel purchases.',
      },
      {
        benefitName: 'Global Entry / TSA PreCheck credit',
        amountLimit: 10000,
        period: 'annual',
        notes: 'Adjust reset date based on your usage cycle.',
      },
      {
        benefitName: 'Priority Pass enrollment',
        amountLimit: 0,
        period: 'annual',
        enrollmentRequired: true,
      },
    ],
  },
  {
    id: 'amex-gold',
    label: 'American Express Gold',
    aliases: ['american express gold', 'amex gold', 'gold card'],
    issuer: 'American Express',
    cardName: 'Gold Card',
    pointsCurrency: 'Membership Rewards',
    pointValueCents: 1,
    annualFee: 32500,
    rewards: [
      { category: 'Everything else', multiplier: 1 },
      { category: 'Dining', multiplier: 4 },
      { category: 'Groceries', multiplier: 4 },
      { category: 'Flights', multiplier: 3 },
    ],
    benefits: [
      {
        benefitName: 'Dining credit',
        amountLimit: 12000,
        period: 'monthly',
        enrollmentRequired: true,
        notes: 'Track monthly usage and eligible merchants.',
      },
      {
        benefitName: 'Uber Cash',
        amountLimit: 12000,
        period: 'monthly',
        enrollmentRequired: true,
        notes: 'Track monthly usage.',
      },
    ],
  },
  {
    id: 'amex-platinum',
    label: 'American Express Platinum',
    aliases: ['american express platinum', 'amex platinum', 'platinum card'],
    issuer: 'American Express',
    cardName: 'Platinum Card',
    pointsCurrency: 'Membership Rewards',
    pointValueCents: 1,
    annualFee: 69500,
    rewards: [
      { category: 'Everything else', multiplier: 1 },
      { category: 'Flights', multiplier: 5 },
      {
        category: 'Hotels',
        multiplier: 5,
        notes: 'Usually prepaid or portal-specific. Verify terms.',
      },
    ],
    benefits: [
      {
        benefitName: 'Airline fee credit',
        amountLimit: 20000,
        period: 'annual',
        enrollmentRequired: true,
      },
      {
        benefitName: 'Hotel credit',
        amountLimit: 20000,
        period: 'annual',
        notes: 'Verify booking channel and eligible properties.',
      },
      {
        benefitName: 'Digital entertainment credit',
        amountLimit: 24000,
        period: 'monthly',
        enrollmentRequired: true,
      },
      {
        benefitName: 'Uber Cash',
        amountLimit: 20000,
        period: 'monthly',
        enrollmentRequired: true,
      },
      {
        benefitName: 'Saks credit',
        amountLimit: 10000,
        period: 'semiannual',
        enrollmentRequired: true,
      },
    ],
  },
  {
    id: 'amex-business-platinum',
    label: 'American Express Business Platinum',
    aliases: [
      'american express business platinum',
      'business platinum card',
      'amex business platinum',
      'business platinum',
    ],
    issuer: 'American Express',
    cardName: 'Business Platinum Card',
    pointsCurrency: 'Membership Rewards',
    pointValueCents: 1,
    annualFee: 69500,
    rewards: [
      { category: 'Everything else', multiplier: 1 },
      {
        category: 'Flights',
        multiplier: 5,
        notes: 'Usually limited to eligible travel bookings. Verify terms.',
      },
      {
        category: 'Hotels',
        multiplier: 5,
        notes: 'Usually limited to eligible travel bookings. Verify terms.',
      },
    ],
    benefits: [
      {
        benefitName: 'Airline fee credit',
        amountLimit: 20000,
        period: 'annual',
        enrollmentRequired: true,
      },
      {
        benefitName: 'Dell credit',
        amountLimit: 40000,
        period: 'semiannual',
        enrollmentRequired: true,
        notes: 'Verify current benefit amount and terms.',
      },
      {
        benefitName: 'Wireless credit',
        amountLimit: 12000,
        period: 'monthly',
        notes: 'Verify current benefit amount and eligibility.',
      },
      {
        benefitName: 'Global Entry / TSA PreCheck credit',
        amountLimit: 10000,
        period: 'annual',
        notes: 'Adjust reset date based on your usage cycle.',
      },
      {
        benefitName: 'Airport lounge access',
        amountLimit: 0,
        period: 'annual',
        enrollmentRequired: true,
      },
    ],
  },
  {
    id: 'amex-delta-gold',
    label: 'Delta SkyMiles Gold Amex',
    aliases: [
      'delta skymiles gold',
      'delta gold',
      'skymiles gold',
    ],
    issuer: 'American Express',
    cardName: 'Delta SkyMiles Gold',
    pointsCurrency: 'Delta SkyMiles',
    pointValueCents: 1,
    annualFee: 15000,
    rewards: [
      { category: 'Everything else', multiplier: 1 },
      { category: 'Dining', multiplier: 2 },
      { category: 'Groceries', multiplier: 2 },
      { category: 'Flights', multiplier: 2, notes: 'Delta purchases.' },
    ],
    benefits: [
      {
        benefitName: 'Delta Stays credit',
        amountLimit: 10000,
        period: 'annual',
        notes: 'Verify current amount and eligibility.',
      },
      {
        benefitName: 'First checked bag benefit',
        amountLimit: 0,
        period: 'annual',
        notes: 'Track as non-cash travel benefit.',
      },
    ],
  },
  {
    id: 'amex-hilton-honors',
    label: 'Hilton Honors Amex',
    aliases: ['hilton honors amex card', 'hilton honors card'],
    issuer: 'American Express',
    cardName: 'Hilton Honors Card',
    pointsCurrency: 'Hilton Honors',
    pointValueCents: 0.5,
    rewards: [
      { category: 'Everything else', multiplier: 3 },
      { category: 'Dining', multiplier: 5 },
      { category: 'Groceries', multiplier: 5 },
      { category: 'Gas', multiplier: 5 },
      { category: 'Hotels', multiplier: 7, notes: 'Hilton purchases.' },
    ],
    benefits: [
      {
        benefitName: 'Hilton status benefit',
        amountLimit: 0,
        period: 'annual',
        notes: 'Track status as non-cash benefit.',
      },
    ],
  },
  {
    id: 'amex-hilton-surpass',
    label: 'Hilton Honors Surpass Amex',
    aliases: ['hilton honors surpass', 'hilton surpass', 'surpass card'],
    issuer: 'American Express',
    cardName: 'Hilton Honors Surpass',
    pointsCurrency: 'Hilton Honors',
    pointValueCents: 0.5,
    annualFee: 15000,
    rewards: [
      { category: 'Everything else', multiplier: 3 },
      { category: 'Dining', multiplier: 6 },
      { category: 'Groceries', multiplier: 6 },
      { category: 'Gas', multiplier: 6 },
      { category: 'Hotels', multiplier: 12, notes: 'Hilton purchases.' },
    ],
    benefits: [
      {
        benefitName: 'Hilton statement credits',
        amountLimit: 20000,
        period: 'quarterly',
        notes: 'Verify current amount, merchant eligibility, and timing.',
      },
      {
        benefitName: 'Hilton status benefit',
        amountLimit: 0,
        period: 'annual',
      },
    ],
  },
  {
    id: 'amex-hilton-aspire',
    label: 'Hilton Honors Aspire Amex',
    aliases: ['hilton honors aspire', 'hilton aspire', 'aspire card'],
    issuer: 'American Express',
    cardName: 'Hilton Honors Aspire',
    pointsCurrency: 'Hilton Honors',
    pointValueCents: 0.5,
    annualFee: 55000,
    rewards: [
      { category: 'Everything else', multiplier: 3 },
      { category: 'Dining', multiplier: 7 },
      { category: 'Flights', multiplier: 7 },
      { category: 'Travel', multiplier: 7 },
      { category: 'Hotels', multiplier: 14, notes: 'Hilton purchases.' },
    ],
    benefits: [
      {
        benefitName: 'Hilton resort credit',
        amountLimit: 40000,
        period: 'semiannual',
        notes: 'Verify current amount, property eligibility, and timing.',
      },
      {
        benefitName: 'Flight credit',
        amountLimit: 20000,
        period: 'quarterly',
        notes: 'Verify current amount and eligible purchases.',
      },
      {
        benefitName: 'Free night reward',
        amountLimit: 0,
        period: 'annual',
        notes: 'Track certificate manually.',
      },
    ],
  },
  {
    id: 'amex-bonvoy-business',
    label: 'Marriott Bonvoy Business Amex',
    aliases: [
      'bonvoy business amex',
      'marriott bonvoy business',
      'bonvoy business',
    ],
    issuer: 'American Express',
    cardName: 'Marriott Bonvoy Business',
    pointsCurrency: 'Marriott Bonvoy',
    pointValueCents: 0.8,
    annualFee: 12500,
    rewards: [
      { category: 'Everything else', multiplier: 2 },
      { category: 'Gas', multiplier: 4 },
      { category: 'Dining', multiplier: 4 },
      { category: 'Transit / rideshare', multiplier: 4 },
      { category: 'Hotels', multiplier: 6, notes: 'Marriott purchases.' },
    ],
    benefits: [
      {
        benefitName: 'Free night award',
        amountLimit: 0,
        period: 'annual',
        notes: 'Track certificate manually.',
      },
      {
        benefitName: 'Marriott status benefit',
        amountLimit: 0,
        period: 'annual',
      },
    ],
  },
  {
    id: 'amex-bonvoy-brilliant',
    label: 'Marriott Bonvoy Brilliant Amex',
    aliases: [
      'marriott bonvoy brilliant',
      'bonvoy brilliant',
      'brilliant american express',
    ],
    issuer: 'American Express',
    cardName: 'Marriott Bonvoy Brilliant',
    pointsCurrency: 'Marriott Bonvoy',
    pointValueCents: 0.8,
    annualFee: 65000,
    rewards: [
      { category: 'Everything else', multiplier: 2 },
      { category: 'Dining', multiplier: 3 },
      { category: 'Flights', multiplier: 3 },
      { category: 'Hotels', multiplier: 6, notes: 'Marriott purchases.' },
    ],
    benefits: [
      {
        benefitName: 'Monthly dining credit',
        amountLimit: 30000,
        period: 'monthly',
        notes: 'Verify current monthly credit and eligible merchants.',
      },
      {
        benefitName: 'Free night award',
        amountLimit: 0,
        period: 'annual',
        notes: 'Track certificate manually.',
      },
      {
        benefitName: 'Marriott status benefit',
        amountLimit: 0,
        period: 'annual',
      },
    ],
  },
  {
    id: 'amex-blue-cash-preferred',
    label: 'American Express Blue Cash Preferred',
    aliases: ['blue cash preferred', 'bcp'],
    issuer: 'American Express',
    cardName: 'Blue Cash Preferred',
    pointsCurrency: 'Cash back',
    pointValueCents: 1,
    annualFee: 9500,
    rewards: [
      { category: 'Everything else', multiplier: 1 },
      { category: 'Groceries', multiplier: 6 },
      { category: 'Gas', multiplier: 3 },
      { category: 'Transit / rideshare', multiplier: 3 },
      {
        category: 'Entertainment',
        multiplier: 6,
        notes: 'Use for streaming if that is how you categorize it.',
      },
    ],
    benefits: [],
  },
  {
    id: 'capital-one-venture-x',
    label: 'Capital One Venture X',
    aliases: ['capital one venture x', 'venture x'],
    issuer: 'Capital One',
    cardName: 'Venture X',
    pointsCurrency: 'Miles',
    pointValueCents: 1,
    annualFee: 39500,
    rewards: [
      { category: 'Everything else', multiplier: 2 },
      {
        category: 'Flights',
        multiplier: 5,
        notes: 'Usually tied to issuer travel portal. Verify terms.',
      },
      {
        category: 'Hotels',
        multiplier: 10,
        notes: 'Usually tied to issuer travel portal. Verify terms.',
      },
    ],
    benefits: [
      {
        benefitName: 'Travel credit',
        amountLimit: 30000,
        period: 'annual',
        notes: 'Verify booking channel and timing.',
      },
      {
        benefitName: 'Anniversary miles',
        amountLimit: 10000,
        period: 'annual',
        notes: 'Cash value depends on your miles valuation.',
      },
      {
        benefitName: 'Global Entry / TSA PreCheck credit',
        amountLimit: 10000,
        period: 'annual',
      },
    ],
  },
  {
    id: 'capital-one-savor',
    label: 'Capital One Savor',
    aliases: ['capital one savor', 'savorone', 'savor'],
    issuer: 'Capital One',
    cardName: 'Savor',
    pointsCurrency: 'Cash back',
    pointValueCents: 1,
    rewards: [
      { category: 'Everything else', multiplier: 1 },
      { category: 'Dining', multiplier: 3 },
      { category: 'Groceries', multiplier: 3 },
      { category: 'Entertainment', multiplier: 3 },
    ],
    benefits: [],
  },
  {
    id: 'citi-custom-cash',
    label: 'Citi Custom Cash',
    aliases: ['citi custom cash', 'custom cash'],
    issuer: 'Citi',
    cardName: 'Custom Cash',
    pointsCurrency: 'ThankYou Points',
    pointValueCents: 1,
    rewards: [
      { category: 'Everything else', multiplier: 1 },
      {
        category: 'Groceries',
        multiplier: 5,
        notes: 'Replace with your top eligible monthly category.',
      },
    ],
    benefits: [],
  },
  {
    id: 'bilt-mastercard',
    label: 'Bilt Mastercard',
    aliases: ['bilt mastercard', 'bilt'],
    issuer: 'Bilt',
    cardName: 'Bilt Mastercard',
    pointsCurrency: 'Bilt Points',
    pointValueCents: 1.25,
    rewards: [
      { category: 'Everything else', multiplier: 1 },
      { category: 'Dining', multiplier: 3 },
      { category: 'Travel', multiplier: 2 },
    ],
    benefits: [
      {
        benefitName: 'Rent rewards',
        amountLimit: 0,
        period: 'monthly',
        notes: 'Track rent separately if useful; category is not in this comparison yet.',
      },
    ],
  },
  {
    id: 'boa-atmos-ascent',
    label: 'Bank of America Atmos Rewards Ascent',
    aliases: [
      'atmos rewards ascent',
      'atmos ascent',
      'ascent visa signature',
    ],
    issuer: 'Bank of America',
    cardName: 'Atmos Rewards Ascent',
    pointsCurrency: 'Atmos Rewards',
    pointValueCents: 1,
    annualFee: 9500,
    rewards: [
      { category: 'Everything else', multiplier: 1 },
      { category: 'Flights', multiplier: 3, notes: 'Airline purchases.' },
      { category: 'Dining', multiplier: 2 },
      { category: 'Gas', multiplier: 2 },
      { category: 'Transit / rideshare', multiplier: 2 },
    ],
    benefits: [
      {
        benefitName: 'Companion fare / airline certificate',
        amountLimit: 0,
        period: 'annual',
        notes: 'Verify annual certificate terms for your exact card.',
      },
      {
        benefitName: 'Checked bag / priority boarding benefits',
        amountLimit: 0,
        period: 'annual',
        notes: 'Track as non-cash airline benefits.',
      },
    ],
  },
  {
    id: 'boa-atmos-summit',
    label: 'Bank of America Atmos Rewards Summit',
    aliases: [
      'atmos rewards summit',
      'atmos summit',
      'summit visa infinite',
    ],
    issuer: 'Bank of America',
    cardName: 'Atmos Rewards Summit',
    pointsCurrency: 'Atmos Rewards',
    pointValueCents: 1,
    annualFee: 39500,
    rewards: [
      { category: 'Everything else', multiplier: 1 },
      { category: 'Flights', multiplier: 3, notes: 'Airline purchases.' },
      { category: 'Dining', multiplier: 2 },
      { category: 'Gas', multiplier: 2 },
      { category: 'Transit / rideshare', multiplier: 2 },
    ],
    benefits: [
      {
        benefitName: 'Airline companion / discount benefit',
        amountLimit: 0,
        period: 'annual',
        notes: 'Verify current Atmos/Alaska terms.',
      },
      {
        benefitName: 'Global Entry / TSA PreCheck credit',
        amountLimit: 10000,
        period: 'annual',
        notes: 'Adjust reset date based on your usage cycle.',
      },
      {
        benefitName: 'Lounge passes / airline benefits',
        amountLimit: 0,
        period: 'annual',
        notes: 'Track non-cash benefits manually.',
      },
    ],
  },
  {
    id: 'chase-freedom',
    label: 'Chase Freedom',
    aliases: ['chase freedom', 'freedom card'],
    issuer: 'Chase',
    cardName: 'Freedom',
    pointsCurrency: 'Ultimate Rewards',
    pointValueCents: 1,
    rewards: [
      { category: 'Everything else', multiplier: 1 },
      {
        category: 'Groceries',
        multiplier: 5,
        notes: 'Placeholder for rotating quarterly category.',
      },
    ],
    benefits: [
      {
        benefitName: 'Quarterly category activation',
        amountLimit: 0,
        period: 'quarterly',
        enrollmentRequired: true,
        notes: 'Activate and replace category rates each quarter.',
      },
    ],
  },
  {
    id: 'chase-marriott-boundless',
    label: 'Chase Marriott Bonvoy Boundless',
    aliases: ['marriott bonvoy boundless', 'bonvoy boundless', 'boundless'],
    issuer: 'Chase',
    cardName: 'Marriott Bonvoy Boundless',
    pointsCurrency: 'Marriott Bonvoy',
    pointValueCents: 0.8,
    annualFee: 9500,
    rewards: [
      { category: 'Everything else', multiplier: 2 },
      { category: 'Groceries', multiplier: 3 },
      { category: 'Gas', multiplier: 3 },
      { category: 'Dining', multiplier: 3 },
      { category: 'Hotels', multiplier: 6, notes: 'Marriott purchases.' },
    ],
    benefits: [
      {
        benefitName: 'Free night award',
        amountLimit: 0,
        period: 'annual',
        notes: 'Track certificate manually.',
      },
      {
        benefitName: 'Marriott status benefit',
        amountLimit: 0,
        period: 'annual',
      },
    ],
  },
  {
    id: 'chase-united-explorer',
    label: 'Chase United Explorer',
    aliases: ['united explorer', 'explorer card'],
    issuer: 'Chase',
    cardName: 'United Explorer',
    pointsCurrency: 'United MileagePlus',
    pointValueCents: 1.2,
    annualFee: 9500,
    rewards: [
      { category: 'Everything else', multiplier: 1 },
      { category: 'Dining', multiplier: 2 },
      { category: 'Hotels', multiplier: 2 },
      { category: 'Flights', multiplier: 2, notes: 'United purchases.' },
    ],
    benefits: [
      {
        benefitName: 'First checked bag benefit',
        amountLimit: 0,
        period: 'annual',
        notes: 'Track as non-cash travel benefit.',
      },
      {
        benefitName: 'United Club one-time passes',
        amountLimit: 0,
        period: 'annual',
        notes: 'Track pass expiration manually.',
      },
      {
        benefitName: 'Global Entry / TSA PreCheck credit',
        amountLimit: 10000,
        period: 'annual',
        notes: 'Adjust reset date based on your usage cycle.',
      },
    ],
  },
  {
    id: 'citi-aadvantage-platinum-select',
    label: 'Citi AAdvantage Platinum Select',
    aliases: [
      'citi aadvantage platinum select',
      'aadvantage platinum select',
      'platinum select world elite',
    ],
    issuer: 'Citi',
    cardName: 'AAdvantage Platinum Select',
    pointsCurrency: 'AAdvantage Miles',
    pointValueCents: 1.2,
    annualFee: 9900,
    rewards: [
      { category: 'Everything else', multiplier: 1 },
      { category: 'Dining', multiplier: 2 },
      { category: 'Gas', multiplier: 2 },
      {
        category: 'Flights',
        multiplier: 2,
        notes: 'American Airlines purchases.',
      },
    ],
    benefits: [
      {
        benefitName: 'First checked bag benefit',
        amountLimit: 0,
        period: 'annual',
        notes: 'Track as non-cash travel benefit.',
      },
      {
        benefitName: 'Preferred boarding benefit',
        amountLimit: 0,
        period: 'annual',
      },
    ],
  },
  {
    id: 'us-bank-altitude-go',
    label: 'U.S. Bank Altitude Go',
    aliases: ['altitude go', 'us bank altitude go'],
    issuer: 'U.S. Bank',
    cardName: 'Altitude Go',
    pointsCurrency: 'Points',
    pointValueCents: 1,
    rewards: [
      { category: 'Everything else', multiplier: 1 },
      { category: 'Dining', multiplier: 4 },
      { category: 'Groceries', multiplier: 2 },
      { category: 'Gas', multiplier: 2 },
      { category: 'Entertainment', multiplier: 2 },
    ],
    benefits: [
      {
        benefitName: 'Streaming credit',
        amountLimit: 1500,
        period: 'annual',
        notes: 'Verify subscription requirement and timing.',
      },
    ],
  },
  {
    id: 'wells-fargo-autograph',
    label: 'Wells Fargo Autograph',
    aliases: ['wells fargo autograph', 'autograph visa', 'autograph card'],
    issuer: 'Wells Fargo',
    cardName: 'Autograph',
    pointsCurrency: 'Wells Fargo Rewards',
    pointValueCents: 1,
    rewards: [
      { category: 'Everything else', multiplier: 1 },
      { category: 'Dining', multiplier: 3 },
      { category: 'Travel', multiplier: 3 },
      { category: 'Gas', multiplier: 3 },
      { category: 'Transit / rideshare', multiplier: 3 },
      { category: 'Entertainment', multiplier: 3 },
    ],
    benefits: [],
  },
];

function isBenefitResetType(value: unknown): value is BenefitResetType {
  return value === 'calendar' || value === 'anniversary' || value === 'custom';
}

function isDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dayParts(day: string) {
  const [year, month, date] = day.split('-').map(Number);
  return { year, month, date };
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function formatDay(year: number, month: number, date: number) {
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(date).padStart(2, '0'),
  ].join('-');
}

function addMonthsToDay(day: string, months: number) {
  const parts = dayParts(day);
  const monthIndex = parts.year * 12 + (parts.month - 1) + months;
  const nextYear = Math.floor(monthIndex / 12);
  const nextMonth = (monthIndex % 12) + 1;
  const nextDate = Math.min(parts.date, daysInMonth(nextYear, nextMonth));
  return formatDay(nextYear, nextMonth, nextDate);
}

function periodMonths(period: BenefitPeriod) {
  switch (period) {
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'semiannual':
      return 6;
    case 'annual':
      return 12;
    case 'one-time':
      return 0;
  }
}

function nextCalendarReset(period: BenefitPeriod, today = monthUtils.currentDay()) {
  const { year, month } = dayParts(today);

  switch (period) {
    case 'monthly':
      return addMonthsToDay(formatDay(year, month, 1), 1);
    case 'quarterly': {
      const nextQuarterMonth = Math.floor((month - 1) / 3) * 3 + 4;
      return nextQuarterMonth > 12
        ? formatDay(year + 1, 1, 1)
        : formatDay(year, nextQuarterMonth, 1);
    }
    case 'semiannual':
      return month < 7 ? formatDay(year, 7, 1) : formatDay(year + 1, 1, 1);
    case 'annual':
      return formatDay(year + 1, 1, 1);
    case 'one-time':
      return today;
  }
}

function nextAnchoredReset(
  period: BenefitPeriod,
  anchorDate: string,
  today = monthUtils.currentDay(),
) {
  const months = periodMonths(period);
  if (!months || !isDay(anchorDate)) {
    return '';
  }

  let next = anchorDate;
  while (next <= today) {
    next = addMonthsToDay(next, months);
  }
  return next;
}

function getNextResetDate(
  period: BenefitPeriod,
  resetType: BenefitResetType,
  resetDate: string,
  anchorDate: string,
  today = monthUtils.currentDay(),
) {
  if (period === 'one-time') {
    return resetDate || '';
  }

  if (resetType === 'calendar') {
    return nextCalendarReset(period, today);
  }

  return nextAnchoredReset(period, anchorDate || resetDate || today, today);
}

function normalizeBenefit(item: Partial<CreditCardBenefit>): CreditCardBenefit {
  const period = item.period || 'annual';
  const resetType = isBenefitResetType(item.resetType)
    ? item.resetType
    : 'custom';
  const anchorDate = isDay(item.anchorDate) ? item.anchorDate : '';
  const resetDate = isDay(item.resetDate)
    ? item.resetDate
    : getNextResetDate(period, resetType, '', anchorDate);

  return {
    id: item.id || uuidv4(),
    accountId: item.accountId || '',
    cardName: item.cardName || '',
    issuer: item.issuer || '',
    benefitName: item.benefitName || '',
    amountLimit: safeAmount(item.amountLimit),
    usedAmount: safeAmount(item.usedAmount),
    period,
    resetDate,
    resetType,
    anchorDate,
    autoReset: item.autoReset !== false,
    enrollmentRequired: Boolean(item.enrollmentRequired),
    enrolled: Boolean(item.enrolled),
    sourceUrl: item.sourceUrl || '',
    notes: item.notes || '',
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString(),
  };
}

function refreshBenefitCycle(
  benefit: CreditCardBenefit,
  today = monthUtils.currentDay(),
) {
  if (
    benefit.autoReset === false ||
    benefit.period === 'one-time' ||
    !benefit.resetDate ||
    benefit.resetDate > today
  ) {
    return benefit;
  }

  const nextResetDate = getNextResetDate(
    benefit.period,
    benefit.resetType || 'custom',
    benefit.resetDate,
    benefit.anchorDate || benefit.resetDate,
    today,
  );

  return {
    ...benefit,
    usedAmount: 0,
    resetDate: nextResetDate || benefit.resetDate,
    updatedAt: new Date().toISOString(),
  };
}

function parseBenefits(pref?: string | null): CreditCardBenefit[] {
  if (!pref) {
    return [];
  }

  try {
    const parsed = JSON.parse(pref);
    return Array.isArray(parsed)
      ? parsed
          .filter(item => item && typeof item === 'object')
          .map(item => normalizeBenefit(item))
      : [];
  } catch {
    return [];
  }
}

function parseFees(pref?: string | null): CreditCardFee[] {
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

function parseRewardCards(pref?: string | null): RewardCard[] {
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

function parsePointSystems(pref?: string | null): RewardPointSystem[] {
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

function parseRewardMultipliers(pref?: string | null): RewardMultiplier[] {
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

function dollarsToAmount(value: string) {
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function amountToDollars(value: number) {
  return Number.isFinite(value) && value ? String(value / 100) : '';
}

function safeAmount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseNumber(value: string, fallback = 0) {
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDraftNumber(value: string | number, fallback = 0) {
  if (typeof value === 'number') {
    return safeNumber(value, fallback);
  }

  return value.trim() ? parseNumber(value, fallback) : fallback;
}

function formatRewardRate(multiplier: number, pointValueCents: number) {
  const rate = multiplier * pointValueCents;
  return `${rate.toFixed(rate % 1 === 0 ? 0 : 2)}%`;
}

function pointSystemIdFromName(name: string) {
  const normalized = normalizeTemplateText(name || 'points').replaceAll(' ', '-');
  return normalized || 'points';
}

function getCardArt(card: RewardCard) {
  const palettes = [
    ['#101827', '#2dd4bf'],
    ['#172554', '#60a5fa'],
    ['#3b0764', '#f0abfc'],
    ['#431407', '#fb923c'],
    ['#052e16', '#86efac'],
    ['#111827', '#f9fafb'],
    ['#312e81', '#a78bfa'],
    ['#7f1d1d', '#fca5a5'],
  ];
  const seed = [...`${card.issuer}${card.cardName}`].reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0,
  );
  const [from, to] = palettes[seed % palettes.length];

  return {
    background: `linear-gradient(135deg, ${from}, ${to})`,
  };
}

function normalizeTemplateText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function findBestTemplateMatch(value: string) {
  const haystack = normalizeTemplateText(value);
  let best:
    | {
        template: CardTemplate;
        score: number;
      }
    | undefined;

  for (const template of CARD_TEMPLATES) {
    for (const alias of template.aliases) {
      const normalizedAlias = normalizeTemplateText(alias);
      if (!normalizedAlias || !haystack.includes(normalizedAlias)) {
        continue;
      }

      if (!best || normalizedAlias.length > best.score) {
        best = {
          template,
          score: normalizedAlias.length,
        };
      }
    }
  }

  return best?.template;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        flex: '1 1 260px',
        gap: 5,
        minWidth: 0,
      }}
    >
      <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function FormGrid({
  children,
  minColumnWidth: _minColumnWidth = 260,
}: {
  children: React.ReactNode;
  minColumnWidth?: number;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        rowGap: 14,
        alignItems: 'end',
      }}
    >
      {children}
    </View>
  );
}

function ButtonRow({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 10,
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'flex-start',
        marginTop: 16,
      }}
    >
      {children}
    </View>
  );
}

function matchesFilter(values: Array<unknown>, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return values
    .filter(value => value !== null && value !== undefined)
    .some(value => String(value).toLowerCase().includes(normalized));
}

function FilterBar({
  value,
  onChange,
  placeholder,
  resultCount,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  resultCount: number;
}) {
  return (
    <View
      style={{
        alignItems: 'center',
        display: 'grid',
        gap: 12,
        gridTemplateColumns: 'minmax(220px, 1fr) auto',
        marginBottom: 12,
      }}
    >
      <Input
        value={value}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
      />
      <Text style={{ color: theme.pageTextSubdued }}>
        {resultCount} <Trans>shown</Trans>
      </Text>
    </View>
  );
}

function PresetFilterBar({
  children,
  resultCount,
}: {
  children: React.ReactNode;
  resultCount: number;
}) {
  return (
    <View
      style={{
        alignItems: 'end',
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 12,
      }}
    >
      {children}
      <Text style={{ color: theme.pageTextSubdued, marginBottom: 8 }}>
        {resultCount} <Trans>shown</Trans>
      </Text>
    </View>
  );
}

function SectionNav({
  sections,
  activeSection,
  onSelectSection,
}: {
  sections: Array<{
    id: string;
    label: string;
    ref: React.RefObject<HTMLDivElement | null>;
  }>;
  activeSection: string;
  onSelectSection: (id: string) => void;
}) {
  return (
    <View
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 2,
        backgroundColor: theme.pageBackground,
        border: `1px solid ${theme.tableBorder}`,
        borderRadius: 999,
        padding: 6,
        flexDirection: 'row',
        gap: 6,
        flexWrap: 'wrap',
        boxShadow: '0 8px 18px rgba(0, 0, 0, 0.08)',
      }}
    >
      {sections.map(section => (
        <Button
          key={section.label}
          variant={section.id === activeSection ? 'primary' : 'normal'}
          onPress={() => {
            onSelectSection(section.id);
            section.ref.current?.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            });
          }}
        >
          {section.label}
        </Button>
      ))}
    </View>
  );
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
        flexShrink: 0,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: 600 }}>{title}</Text>
      {children}
    </View>
  );
}


function BenefitCycleFields({
  draft,
  setDraft,
  t,
}: {
  draft: BenefitDraft;
  setDraft: React.Dispatch<React.SetStateAction<BenefitDraft>>;
  t: (value: string) => string;
}) {
  const resetType = draft.resetType || 'custom';

  function updateCycle(diff: Partial<BenefitDraft>) {
    setDraft(current => {
      const next = { ...current, ...diff };
      const nextResetType = next.resetType || 'custom';
      const anchorDate =
        nextResetType === 'anniversary'
          ? next.anchorDate || next.resetDate || monthUtils.currentDay()
          : next.anchorDate || '';

      return {
        ...next,
        anchorDate,
        resetDate:
          nextResetType === 'calendar' || nextResetType === 'anniversary'
            ? getNextResetDate(
                next.period,
                nextResetType,
                next.resetDate,
                anchorDate,
              )
            : next.resetDate,
      };
    });
  }

  return (
    <>
      <Field label={t('Period')}>
        <Select
          value={draft.period}
          options={PERIOD_OPTIONS.map(
            ([value, label]) => [value, t(label)] as const,
          )}
          onChange={value => updateCycle({ period: value as BenefitPeriod })}
        />
      </Field>
      <Field label={t('Reset type')}>
        <Select
          value={resetType}
          options={RESET_TYPE_OPTIONS.map(
            ([value, label]) => [value, t(label)] as const,
          )}
          onChange={value =>
            updateCycle({ resetType: value as BenefitResetType })
          }
        />
      </Field>
      {resetType === 'anniversary' && (
        <Field label={t('Anniversary date')}>
          <Input
            type="date"
            value={draft.anchorDate || ''}
            onChange={event => updateCycle({ anchorDate: event.target.value })}
          />
        </Field>
      )}
      <Field label={t('Next reset date')}>
        <Input
          type="date"
          value={draft.resetDate}
          onChange={event => updateCycle({ resetDate: event.target.value })}
        />
      </Field>
      <Field label={t('Auto refresh')}>
        <label style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
          <Checkbox
            checked={draft.autoReset !== false}
            onChange={() =>
              setDraft(current => ({
                ...current,
                autoReset: current.autoReset === false,
              }))
            }
          />
          <Trans>Reset used amount each new cycle</Trans>
        </label>
      </Field>
    </>
  );
}

export function CreditCardBenefits() {
  const { t } = useTranslation();
  const format = useFormat();
  const { data: accounts = [] } = useAccounts();
  const [benefitsPref, setBenefitsPref] = useSyncedPref(
    'custom-sync-mappings-credit-card-benefits',
  );
  const [feesPref, setFeesPref] = useSyncedPref(
    'custom-sync-mappings-credit-card-fees',
  );
  const [rewardCardsPref, setRewardCardsPref] = useSyncedPref(
    'custom-sync-mappings-credit-card-reward-cards',
  );
  const [pointSystemsPref, setPointSystemsPref] = useSyncedPref(
    'custom-sync-mappings-credit-card-point-systems',
  );
  const [rewardMultipliersPref, setRewardMultipliersPref] = useSyncedPref(
    'custom-sync-mappings-credit-card-reward-multipliers',
  );
  const [accountCategoryPref] = useSyncedPref(
    'custom-sync-mappings-account-category',
  );

  const [draft, setDraft] = useState<BenefitDraft>(EMPTY_DRAFT);
  const [feeDraft, setFeeDraft] = useState<FeeDraft>(EMPTY_FEE_DRAFT);
  const [rewardCardDraft, setRewardCardDraft] = useState<RewardCardDraft>(
    EMPTY_REWARD_CARD_DRAFT,
  );
  const [pointSystemDraft, setPointSystemDraft] =
    useState<RewardPointSystemDraft>(EMPTY_POINT_SYSTEM_DRAFT);
  const [multiplierDraft, setMultiplierDraft] =
    useState<RewardMultiplierDraft>(EMPTY_MULTIPLIER_DRAFT);
  const [editingBenefitId, setEditingBenefitId] = useState<string | null>(null);
  const [editingFeeId, setEditingFeeId] = useState<string | null>(null);
  const [editingRewardCardId, setEditingRewardCardId] = useState<string | null>(
    null,
  );
  const [editingPointSystemId, setEditingPointSystemId] = useState<
    string | null
  >(null);
  const [editingMultiplierId, setEditingMultiplierId] = useState<string | null>(
    null,
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    CARD_TEMPLATES[0]?.id || '',
  );
  const [selectedRewardCardId, setSelectedRewardCardId] = useState('');
  const [activeSection, setActiveSection] = useState('wallet');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [lastDeletedRewardCard, setLastDeletedRewardCard] =
    useState<DeletedRewardCardSnapshot | null>(null);
  const overviewRef = useRef<HTMLDivElement>(null);
  const walletRef = useRef<HTMLDivElement>(null);
  const templatesRef = useRef<HTMLDivElement>(null);
  const pointSystemsRef = useRef<HTMLDivElement>(null);
  const rewardsRef = useRef<HTMLDivElement>(null);
  const feesRef = useRef<HTMLDivElement>(null);
  const benefitsRef = useRef<HTMLDivElement>(null);
  const walletScrollRef = useRef<HTMLDivElement | null>(null);

  const benefits = useMemo(() => parseBenefits(benefitsPref), [benefitsPref]);
  const fees = useMemo(() => parseFees(feesPref), [feesPref]);
  const rewardCards = useMemo(
    () => parseRewardCards(rewardCardsPref),
    [rewardCardsPref],
  );
  const savedPointSystems = useMemo(
    () => parsePointSystems(pointSystemsPref),
    [pointSystemsPref],
  );
  const rewardMultipliers = useMemo(
    () => parseRewardMultipliers(rewardMultipliersPref),
    [rewardMultipliersPref],
  );
  const accountCategoryMap = useMemo(
    () => parseAccountCategories(accountCategoryPref),
    [accountCategoryPref],
  );

  useEffect(() => {
    const refreshed = benefits.map(benefit => refreshBenefitCycle(benefit));
    if (JSON.stringify(refreshed) !== JSON.stringify(benefits)) {
      setBenefitsPref(JSON.stringify(refreshed));
    }
  }, [benefits, setBenefitsPref]);

  const creditAccounts = useMemo(() => {
    const active = accounts.filter(account => !account.closed);
    const credit = active.filter(
      account =>
        classifyAccount(account, accountCategoryMap) ===
        ('credit' satisfies AccountGroup),
    );
    return credit.length > 0 ? credit : active;
  }, [accountCategoryMap, accounts]);

  const pageSections = useMemo(
    () => [
      { id: 'wallet', label: t('Wallet'), ref: walletRef },
      { id: 'overview', label: t('Overview'), ref: overviewRef },
      { id: 'benefits', label: t('Benefits'), ref: benefitsRef },
      { id: 'rewards', label: t('Rewards'), ref: rewardsRef },
      { id: 'fees', label: t('Fees'), ref: feesRef },
      { id: 'point-systems', label: t('Point systems'), ref: pointSystemsRef },
      { id: 'templates', label: t('Templates'), ref: templatesRef },
    ],
    [t],
  );

  const accountOptions = useMemo(
    () => [
      ['', t('Manual / not linked')] as const,
      ...creditAccounts.map(account => [account.id, account.name] as const),
    ],
    [creditAccounts, t],
  );

  const pointSystems = useMemo(() => {
    const systems = new Map<string, RewardPointSystem>();
    for (const system of savedPointSystems) {
      if (!system.name?.trim()) {
        continue;
      }
      const id = system.id || pointSystemIdFromName(system.name);
      systems.set(id, {
        ...system,
        id,
        name: system.name.trim(),
        pointValueCents: safeNumber(system.pointValueCents, 1),
      });
    }
    for (const card of rewardCards) {
      const name = card.pointsCurrency?.trim() || 'points';
      const id = card.pointSystemId || pointSystemIdFromName(name);
      if (!systems.has(id)) {
        systems.set(id, {
          id,
          name,
          pointValueCents: safeNumber(card.pointValueCents, 1),
          createdAt: card.createdAt || new Date().toISOString(),
          updatedAt: card.updatedAt || new Date().toISOString(),
        });
      }
    }
    return [...systems.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rewardCards, savedPointSystems]);

  const pointSystemOptions = useMemo(
    () => [
      ['', t('Select point system')] as const,
      ...pointSystems.map(system => [system.id, system.name] as const),
    ],
    [pointSystems, t],
  );

  const rewardCardOptions = useMemo(
    () => [
      ['', t('Select card')] as const,
      ...rewardCards.map(card => [card.id, card.cardName] as const),
    ],
    [rewardCards, t],
  );

  const rewardCardFilterOptions = useMemo(
    () => [
      ['', t('All cards')] as const,
      ...rewardCards.map(
        card => [card.id, `${card.issuer} - ${card.cardName}`] as const,
      ),
    ],
    [rewardCards, t],
  );

  const spendCategoryFilterOptions = useMemo(
    () => [
      ['', t('All categories')] as const,
      ...SPEND_CATEGORY_OPTIONS.map(value => [value, t(value)] as const),
    ],
    [t],
  );

  const pointSystemFilterOptions = useMemo(
    () => [
      ['', t('All point systems')] as const,
      ...pointSystems.map(system => [system.id, system.name] as const),
    ],
    [pointSystems, t],
  );

  const feeCardFilterOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: Array<readonly [string, string]> = [
      ['', t('All cards')] as const,
    ];
    for (const fee of fees) {
      const id = fee.accountId || `${fee.issuer}::${fee.cardName}`;
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      options.push([id, [fee.issuer, fee.cardName].filter(Boolean).join(' - ')]);
    }
    return options;
  }, [fees, t]);

  const benefitCardFilterOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: Array<readonly [string, string]> = [
      ['', t('All cards')] as const,
    ];
    for (const benefit of benefits) {
      const id = benefit.accountId || `${benefit.issuer}::${benefit.cardName}`;
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      options.push([
        id,
        [benefit.issuer, benefit.cardName].filter(Boolean).join(' - '),
      ]);
    }
    return options;
  }, [benefits, t]);

  const benefitPeriodFilterOptions = useMemo(
    () => [
      ['', t('All cycles')] as const,
      ...PERIOD_OPTIONS.map(([value, label]) => [value, t(label)] as const),
    ],
    [t],
  );

  const templateOptions = useMemo(
    () =>
      CARD_TEMPLATES.map(template => [template.id, t(template.label)] as const),
    [t],
  );

  const spendCategoryOptions = useMemo(
    () => SPEND_CATEGORY_OPTIONS.map(value => [value, t(value)] as const),
    [t],
  );

  const rewardCardsById = useMemo(
    () => new Map(rewardCards.map(card => [card.id, card])),
    [rewardCards],
  );

  const selectedRewardCard = useMemo(
    () =>
      rewardCards.find(card => card.id === selectedRewardCardId) ||
      rewardCards[0],
    [rewardCards, selectedRewardCardId],
  );

  const matchedTemplates = useMemo(() => {
    return creditAccounts
      .filter(account => !rewardCards.some(card => card.accountId === account.id))
      .map(account => {
        const template = findBestTemplateMatch(
          [account.name, account.bankName || '', account.bank || ''].join(' '),
        );
        return template ? { account, template } : null;
      })
      .filter((match): match is NonNullable<typeof match> => Boolean(match));
  }, [creditAccounts, rewardCards]);

  const matchedTemplateFilterOptions = useMemo(
    () => [
      ['', t('All missing cards')] as const,
      ...matchedTemplates.map(
        ({ account, template }) =>
          [account.id, `${account.name} - ${template.label}`] as const,
      ),
    ],
    [matchedTemplates, t],
  );

  function getPointSystemForCard(card: RewardCard) {
    return (
      pointSystems.find(system => system.id === card.pointSystemId) ||
      pointSystems.find(system => system.name === card.pointsCurrency)
    );
  }

  function getPointValueForCard(card: RewardCard) {
    return safeNumber(
      getPointSystemForCard(card)?.pointValueCents,
      safeNumber(card.pointValueCents, 1),
    );
  }

  const selectedCardDetails = useMemo(() => {
    if (!selectedRewardCard) {
      return undefined;
    }
    const matchesCard = (
      item: { accountId?: string; cardName: string; issuer: string },
    ) => {
      if (item.accountId) {
        return item.accountId === selectedRewardCard.accountId;
      }
      return (
        item.cardName === selectedRewardCard.cardName &&
        item.issuer === selectedRewardCard.issuer
      );
    };
    const cardBenefits = benefits.filter(matchesCard);
    const cardFees = fees.filter(matchesCard);
    const cardMultipliers = rewardMultipliers.filter(
      item => item.rewardCardId === selectedRewardCard.id,
    );
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
      benefits: cardBenefits,
      fees: cardFees,
      multipliers: cardMultipliers,
      totalBenefitLimit,
      totalBenefitUsed,
      availableBenefitValue: Math.max(totalBenefitLimit - totalBenefitUsed, 0),
      totalFees,
      netValue: totalBenefitLimit - totalFees,
    };
  }, [benefits, fees, rewardMultipliers, selectedRewardCard]);

  const summary = useMemo(() => {
    const totalLimit = benefits.reduce(
      (sum, item) => sum + safeAmount(item.amountLimit),
      0,
    );
    const totalUsed = benefits.reduce(
      (sum, item) => sum + safeAmount(item.usedAmount),
      0,
    );
    const totalFees = fees.reduce(
      (sum, item) => sum + safeAmount(item.annualFee),
      0,
    );
    const needsEnrollment = benefits.filter(
      item => item.enrollmentRequired && !item.enrolled,
    ).length;
    const expiringSoon = benefits.filter(
      item =>
        item.resetDate &&
        item.resetDate <= monthUtils.addDays(monthUtils.currentDay(), 30),
    ).length;
    return {
      totalLimit,
      totalUsed,
      remaining: Math.max(totalLimit - totalUsed, 0),
      totalFees,
      netValue: totalLimit - totalFees,
      needsEnrollment,
      expiringSoon,
    };
  }, [benefits, fees]);

  const rewardRecommendations = useMemo<RewardRecommendation[]>(() => {
    return SPEND_CATEGORY_OPTIONS.map(category => {
      let best: RewardRecommendation['best'];
      for (const multiplier of rewardMultipliers) {
        if (
          multiplier.category !== category &&
          multiplier.category !== 'Everything else'
        ) {
          continue;
        }
        const card = rewardCardsById.get(multiplier.rewardCardId);
        if (!card) {
          continue;
        }
        const value =
          safeNumber(multiplier.multiplier) * getPointValueForCard(card);
        if (!best || value > best.effectiveRate) {
          best = {
            card,
            multiplier: safeNumber(multiplier.multiplier),
            effectiveRate: value,
            sourceCategory: multiplier.category,
            notes: multiplier.notes,
          };
        }
      }
      return { category, best };
    });
  }, [rewardCardsById, rewardMultipliers, pointSystems]);

  const filteredMatchedTemplates = useMemo(
    () =>
      matchedTemplates.filter(
        ({ account }) =>
          !filters.templatesCard || account.id === filters.templatesCard,
      ),
    [filters.templatesCard, matchedTemplates],
  );

  const filteredPointSystems = useMemo(
    () =>
      pointSystems.filter(system =>
        !filters.pointSystem || system.id === filters.pointSystem,
      ),
    [filters.pointSystem, pointSystems],
  );

  const filteredRewardRecommendations = useMemo(
    () =>
      rewardRecommendations.filter(row =>
        (!filters.rewardsCategory || row.category === filters.rewardsCategory) &&
        (!filters.rewardsCard || row.best?.card.id === filters.rewardsCard),
      ),
    [filters.rewardsCard, filters.rewardsCategory, rewardRecommendations],
  );

  const filteredRewardMultipliers = useMemo(
    () =>
      rewardMultipliers.filter(multiplier => {
        const card = rewardCardsById.get(multiplier.rewardCardId);
        return (
          (!filters.rewardsCard || card?.id === filters.rewardsCard) &&
          (!filters.rewardsCategory ||
            multiplier.category === filters.rewardsCategory)
        );
      }),
    [filters.rewardsCard, filters.rewardsCategory, rewardCardsById, rewardMultipliers],
  );

  const filteredFees = useMemo(
    () =>
      fees.filter(fee => {
        if (!filters.feesCard) {
          return true;
        }
        return (
          fee.accountId === filters.feesCard ||
          `${fee.issuer}::${fee.cardName}` === filters.feesCard
        );
      }),
    [fees, filters.feesCard],
  );

  const filteredBenefits = useMemo(
    () =>
      benefits.filter(benefit => {
        const matchesCard =
          !filters.benefitsCard ||
          benefit.accountId === filters.benefitsCard ||
          `${benefit.issuer}::${benefit.cardName}` === filters.benefitsCard;
        const matchesPeriod =
          !filters.benefitsPeriod || benefit.period === filters.benefitsPeriod;
        return matchesCard && matchesPeriod;
      }),
    [benefits, filters.benefitsCard, filters.benefitsPeriod],
  );

  const selectedCardIndex = selectedRewardCard
    ? rewardCards.findIndex(card => card.id === selectedRewardCard.id)
    : -1;

  function saveBenefits(next: CreditCardBenefit[]) {
    setBenefitsPref(JSON.stringify(next));
  }

  function saveFees(next: CreditCardFee[]) {
    setFeesPref(JSON.stringify(next));
  }

  function saveRewardCards(next: RewardCard[]) {
    setRewardCardsPref(JSON.stringify(next));
  }

  function savePointSystems(next: RewardPointSystem[]) {
    setPointSystemsPref(JSON.stringify(next));
  }

  function saveRewardMultipliers(next: RewardMultiplier[]) {
    setRewardMultipliersPref(JSON.stringify(next));
  }

  function onSelectAccount(accountId: string) {
    const account = accounts.find(item => item.id === accountId);
    setDraft(current => ({
      ...current,
      accountId,
      cardName: account?.name || current.cardName,
      issuer:
        account?.bankName?.trim() || account?.bank?.trim() || current.issuer,
    }));
  }

  function onSelectRewardAccount(accountId: string) {
    const account = accounts.find(item => item.id === accountId);
    setRewardCardDraft(current => ({
      ...current,
      accountId,
      cardName: account?.name || current.cardName,
      issuer:
        account?.bankName?.trim() || account?.bank?.trim() || current.issuer,
      imageUrl:
        current.imageUrl ||
        findCardArt({
          issuer: account?.bankName || account?.bank || undefined,
          cardName: account?.name || undefined,
          accountName: account?.name || undefined,
        }) || undefined,
    }));
  }

  function onSelectRewardPointSystem(pointSystemId: string) {
    const system = pointSystems.find(item => item.id === pointSystemId);
    setRewardCardDraft(current => ({
      ...current,
      pointSystemId,
      pointsCurrency: system?.name || current.pointsCurrency,
      pointValueCents: safeNumber(
        system?.pointValueCents,
        current.pointValueCents,
      ),
    }));
  }

  function prepareBenefitDraft(nextDraft: BenefitDraft) {
    const resetType = nextDraft.resetType || 'custom';
    const anchorDate =
      resetType === 'anniversary'
        ? nextDraft.anchorDate || nextDraft.resetDate || monthUtils.currentDay()
        : nextDraft.anchorDate || '';
    const resetDate =
      resetType === 'calendar' || resetType === 'anniversary'
        ? getNextResetDate(
            nextDraft.period,
            resetType,
            nextDraft.resetDate,
            anchorDate,
          )
        : nextDraft.resetDate;
    return refreshBenefitCycle(
      normalizeBenefit({
        ...nextDraft,
        cardName: nextDraft.cardName.trim(),
        issuer: nextDraft.issuer.trim(),
        benefitName: nextDraft.benefitName.trim(),
        resetType,
        anchorDate,
        resetDate,
        sourceUrl: nextDraft.sourceUrl.trim(),
        notes: nextDraft.notes.trim(),
      }),
    );
  }

  function onAddBenefit() {
    if (!draft.benefitName.trim()) {
      return;
    }
    const prepared = prepareBenefitDraft(draft);
    if (editingBenefitId) {
      saveBenefits(
        benefits.map(item =>
          item.id === editingBenefitId
            ? {
                ...prepared,
                id: editingBenefitId,
                createdAt: item.createdAt,
                updatedAt: new Date().toISOString(),
              }
            : item,
        ),
      );
      setEditingBenefitId(null);
      setDraft(EMPTY_DRAFT);
      return;
    }
    const now = new Date().toISOString();
    saveBenefits([
      { ...prepared, id: uuidv4(), createdAt: now, updatedAt: now },
      ...benefits,
    ]);
    setDraft(EMPTY_DRAFT);
  }

  function startEditBenefit(benefit: CreditCardBenefit) {
    setEditingBenefitId(benefit.id);
    setDraft({
      accountId: benefit.accountId || '',
      cardName: benefit.cardName,
      issuer: benefit.issuer,
      benefitName: benefit.benefitName,
      amountLimit: benefit.amountLimit,
      usedAmount: benefit.usedAmount,
      period: benefit.period,
      resetDate: benefit.resetDate,
      resetType: benefit.resetType || 'custom',
      anchorDate: benefit.anchorDate || '',
      autoReset: benefit.autoReset !== false,
      enrollmentRequired: benefit.enrollmentRequired,
      enrolled: benefit.enrolled,
      sourceUrl: benefit.sourceUrl,
      notes: benefit.notes,
    });
  }

  function updateBenefit(id: string, diff: Partial<CreditCardBenefit>) {
    saveBenefits(
      benefits.map(item =>
        item.id === id
          ? refreshBenefitCycle({
              ...item,
              ...diff,
              updatedAt: new Date().toISOString(),
            })
          : item,
      ),
    );
  }

  function deleteBenefit(id: string) {
    saveBenefits(benefits.filter(item => item.id !== id));
  }

  function onAddFee() {
    if (!feeDraft.cardName.trim() && !feeDraft.accountId) {
      return;
    }
    const now = new Date().toISOString();
    if (editingFeeId) {
      saveFees(
        fees.map(item =>
          item.id === editingFeeId
            ? { ...item, ...feeDraft, updatedAt: now }
            : item,
        ),
      );
      setEditingFeeId(null);
    } else {
      saveFees([
        { ...feeDraft, id: uuidv4(), createdAt: now, updatedAt: now },
        ...fees,
      ]);
    }
    setFeeDraft(EMPTY_FEE_DRAFT);
  }

  function startEditFee(fee: CreditCardFee) {
    setEditingFeeId(fee.id);
    setFeeDraft({
      accountId: fee.accountId || '',
      cardName: fee.cardName,
      issuer: fee.issuer,
      annualFee: fee.annualFee,
      feeDueDate: fee.feeDueDate,
      notes: fee.notes,
    });
  }

  function deleteFee(id: string) {
    saveFees(fees.filter(item => item.id !== id));
  }

  function onAddPointSystem() {
    if (!pointSystemDraft.name.trim()) {
      return;
    }
    const now = new Date().toISOString();
    const next = {
      id: editingPointSystemId || pointSystemIdFromName(pointSystemDraft.name),
      name: pointSystemDraft.name.trim(),
      pointValueCents: parseDraftNumber(pointSystemDraft.pointValueCents, 1),
      createdAt:
        savedPointSystems.find(item => item.id === editingPointSystemId)
          ?.createdAt || now,
      updatedAt: now,
    };
    savePointSystems(
      editingPointSystemId
        ? savedPointSystems.map(item =>
            item.id === editingPointSystemId ? next : item,
          )
        : [...savedPointSystems, next],
    );
    setEditingPointSystemId(null);
    setPointSystemDraft(EMPTY_POINT_SYSTEM_DRAFT);
  }

  function startEditPointSystem(system: RewardPointSystem) {
    setEditingPointSystemId(system.id);
    setPointSystemDraft({
      name: system.name,
      pointValueCents: String(system.pointValueCents),
    });
  }

  function deletePointSystem(id: string) {
    savePointSystems(savedPointSystems.filter(item => item.id !== id));
  }

  function onAddRewardCard() {
    if (!rewardCardDraft.cardName.trim() && !rewardCardDraft.accountId) {
      return;
    }
    const now = new Date().toISOString();
    const next = {
      ...rewardCardDraft,
      cardName: rewardCardDraft.cardName.trim(),
      issuer: rewardCardDraft.issuer.trim(),
      imageUrl:
        rewardCardDraft.imageUrl?.trim() ||
        findCardArt({
          issuer: rewardCardDraft.issuer,
          cardName: rewardCardDraft.cardName,
        }),
      pointsCurrency: rewardCardDraft.pointsCurrency.trim() || 'points',
      pointValueCents: safeNumber(rewardCardDraft.pointValueCents, 1),
      updatedAt: now,
    };
    if (editingRewardCardId) {
      saveRewardCards(
        rewardCards.map(item =>
          item.id === editingRewardCardId ? { ...item, ...next } : item,
        ),
      );
      setEditingRewardCardId(null);
    } else {
      saveRewardCards([
        { ...next, id: uuidv4(), createdAt: now },
        ...rewardCards,
      ]);
    }
    setRewardCardDraft(EMPTY_REWARD_CARD_DRAFT);
  }

  function startEditRewardCard(card: RewardCard) {
    setActiveSection('rewards');
    setEditingRewardCardId(card.id);
    setRewardCardDraft({
      accountId: card.accountId || '',
      cardName: card.cardName,
      issuer: card.issuer,
      imageUrl: card.imageUrl || '',
      pointSystemId: card.pointSystemId || '',
      pointsCurrency: card.pointsCurrency,
      pointValueCents: card.pointValueCents,
    });
    window.setTimeout(() => {
      rewardsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  function deleteRewardCard(id: string) {
    const card = rewardCards.find(item => item.id === id);
    if (!card) {
      return;
    }
    const confirmed = window.confirm(
      t(
        'Delete this card and its reward rates? You can undo it until you leave this page.',
      ),
    );
    if (!confirmed) {
      return;
    }
    const deletedMultipliers = rewardMultipliers.filter(
      item => item.rewardCardId === id,
    );
    setLastDeletedRewardCard({ card, multipliers: deletedMultipliers });
    saveRewardCards(rewardCards.filter(item => item.id !== id));
    saveRewardMultipliers(
      rewardMultipliers.filter(item => item.rewardCardId !== id),
    );
    if (selectedRewardCardId === id) {
      setSelectedRewardCardId(
        rewardCards.find(item => item.id !== id)?.id || '',
      );
    }
  }

  function restoreLastDeletedRewardCard() {
    if (!lastDeletedRewardCard) {
      return;
    }
    const { card, multipliers } = lastDeletedRewardCard;
    saveRewardCards([
      card,
      ...rewardCards.filter(item => item.id !== card.id),
    ]);
    saveRewardMultipliers([
      ...multipliers,
      ...rewardMultipliers.filter(item => item.rewardCardId !== card.id),
    ]);
    setSelectedRewardCardId(card.id);
    setLastDeletedRewardCard(null);
    setActiveSection('wallet');
  }

  function onAddMultiplier() {
    if (!multiplierDraft.rewardCardId) {
      return;
    }
    const now = new Date().toISOString();
    if (editingMultiplierId) {
      saveRewardMultipliers(
        rewardMultipliers.map(item =>
          item.id === editingMultiplierId
            ? { ...item, ...multiplierDraft, updatedAt: now }
            : item,
        ),
      );
      setEditingMultiplierId(null);
    } else {
      saveRewardMultipliers([
        { ...multiplierDraft, id: uuidv4(), createdAt: now, updatedAt: now },
        ...rewardMultipliers,
      ]);
    }
    setMultiplierDraft(EMPTY_MULTIPLIER_DRAFT);
  }

  function startEditMultiplier(multiplier: RewardMultiplier) {
    setEditingMultiplierId(multiplier.id);
    setMultiplierDraft({ ...multiplier });
  }

  function deleteMultiplier(id: string) {
    saveRewardMultipliers(rewardMultipliers.filter(item => item.id !== id));
  }

  function importTemplateForCard(template: CardTemplate, account?: { id: string; name: string; bankName?: string | null; bank?: string | null }) {
    const now = new Date().toISOString();
    const cardId = uuidv4();
    const card: RewardCard = {
      id: cardId,
      accountId: account?.id || '',
      cardName: account?.name || template.cardName,
      issuer: account?.bankName || account?.bank || template.issuer,
      imageUrl: findCardArt({ issuer: template.issuer, cardName: template.cardName, accountName: account?.name }),
      pointSystemId: pointSystemIdFromName(template.pointsCurrency),
      pointsCurrency: template.pointsCurrency,
      pointValueCents: template.pointValueCents,
      createdAt: now,
      updatedAt: now,
    };
    const nextBenefits = template.benefits.map(benefit =>
      normalizeBenefit({
        id: uuidv4(),
        accountId: card.accountId,
        cardName: card.cardName,
        issuer: card.issuer,
        benefitName: benefit.benefitName,
        amountLimit: benefit.amountLimit,
        usedAmount: 0,
        period: benefit.period,
        resetDate: getNextResetDate(benefit.period, 'custom', monthUtils.currentDay(), ''),
        resetType: 'custom',
        autoReset: true,
        enrollmentRequired: Boolean(benefit.enrollmentRequired),
        enrolled: false,
        sourceUrl: '',
        notes: benefit.notes || '',
        createdAt: now,
        updatedAt: now,
      }),
    );
    const nextMultipliers = template.rewards.map(reward => ({
      id: uuidv4(),
      rewardCardId: cardId,
      category: reward.category,
      multiplier: reward.multiplier,
      notes: reward.notes || '',
      createdAt: now,
      updatedAt: now,
    }));
    const nextFees = template.annualFee
      ? [{
          id: uuidv4(),
          accountId: card.accountId,
          cardName: card.cardName,
          issuer: card.issuer,
          annualFee: template.annualFee,
          feeDueDate: monthUtils.currentDay(),
          notes: 'Imported from starter template. Adjust to your card terms.',
          createdAt: now,
          updatedAt: now,
        }]
      : [];
    saveRewardCards([card, ...rewardCards]);
    saveRewardMultipliers([...nextMultipliers, ...rewardMultipliers]);
    saveBenefits([...nextBenefits, ...benefits]);
    saveFees([...nextFees, ...fees]);
  }

  function importTemplate() {
    const template = CARD_TEMPLATES.find(item => item.id === selectedTemplateId);
    if (template) {
      importTemplateForCard(template);
    }
  }

  function importMatchedTemplates() {
    for (const { account, template } of matchedTemplates) {
      importTemplateForCard(template, account);
    }
  }

  function restoreMissingRewardCards() {
    if (matchedTemplates.length === 0) {
      return;
    }
    if (
      matchedTemplates.length > 1 &&
      !window.confirm(
        t('Restore {{count}} missing wallet cards and their reward rates?', {
          count: matchedTemplates.length,
        }),
      )
    ) {
      return;
    }
    const now = new Date().toISOString();
    const nextCards: RewardCard[] = [];
    const nextMultipliers: RewardMultiplier[] = [];
    for (const { account, template } of matchedTemplates) {
      const cardId = uuidv4();
      nextCards.push({
        id: cardId,
        accountId: account.id,
        cardName: account.name || template.cardName,
        issuer: account.bankName || account.bank || template.issuer,
        imageUrl: findCardArt({
          issuer: template.issuer,
          cardName: template.cardName,
          accountName: account.name,
        }),
        pointSystemId: pointSystemIdFromName(template.pointsCurrency),
        pointsCurrency: template.pointsCurrency,
        pointValueCents: template.pointValueCents,
        createdAt: now,
        updatedAt: now,
      });
      nextMultipliers.push(
        ...template.rewards.map(reward => ({
          id: uuidv4(),
          rewardCardId: cardId,
          category: reward.category,
          multiplier: reward.multiplier,
          notes: reward.notes || '',
          createdAt: now,
          updatedAt: now,
        })),
      );
    }
    saveRewardCards([...nextCards, ...rewardCards]);
    saveRewardMultipliers([...nextMultipliers, ...rewardMultipliers]);
    setSelectedRewardCardId(nextCards[0]?.id || selectedRewardCardId);
  }

  function addBenefitForCard(card: RewardCard) {
    setActiveSection('benefits');
    setEditingBenefitId(null);
    setDraft({
      ...EMPTY_DRAFT,
      accountId: card.accountId || '',
      cardName: card.cardName,
      issuer: card.issuer,
    });
    window.setTimeout(() => {
      benefitsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  function addFeeForCard(card: RewardCard) {
    setActiveSection('fees');
    setEditingFeeId(null);
    setFeeDraft({
      ...EMPTY_FEE_DRAFT,
      accountId: card.accountId || '',
      cardName: card.cardName,
      issuer: card.issuer,
    });
    window.setTimeout(() => {
      feesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  function addRewardForCard(card: RewardCard) {
    setActiveSection('rewards');
    setEditingMultiplierId(null);
    setMultiplierDraft({
      ...EMPTY_MULTIPLIER_DRAFT,
      rewardCardId: card.id,
    });
    window.setTimeout(() => {
      rewardsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  function selectRewardWalletCard(cardId: string) {
    setSelectedRewardCardId(cardId);
    walletScrollRef.current
      ?.querySelector<HTMLElement>(`[data-card-id="${cardId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  function handleRewardWalletScroll() {
    const container = walletScrollRef.current;
    if (!container || rewardCards.length === 0) {
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const center = containerRect.left + containerRect.width / 2;
    let closestId = '';
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const child of Array.from(container.children)) {
      const element = child as HTMLElement;
      const cardId = element.dataset.cardId;
      if (!cardId) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - center);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestId = cardId;
      }
    }
    if (closestId && closestId !== selectedRewardCardId) {
      setSelectedRewardCardId(closestId);
    }
  }

  return (
    <Page header={t('Credit Card Benefits')}>
      <View style={{ gap: 18, paddingBottom: 24, paddingTop: 10 }}>
        <SectionNav sections={pageSections} activeSection={activeSection} onSelectSection={setActiveSection} />
        {(activeSection === 'wallet' || activeSection === 'overview') && (
        <View ref={overviewRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          <Card title={t('Available value')}><Text style={{ fontSize: 24, fontWeight: 650 }}>{format(summary.remaining, 'financial')}</Text><Text style={{ color: theme.pageTextSubdued }}><Trans>Remaining tracked credit value after recorded usage.</Trans></Text></Card>
          <Card title={t('Used benefits')}><Text style={{ fontSize: 24, fontWeight: 650 }}>{format(summary.totalUsed, 'financial')}</Text><Text style={{ color: theme.pageTextSubdued }}>{format(summary.totalLimit, 'financial')} <Trans>tracked</Trans></Text></Card>
          <Card title={t('Annual fees')}><Text style={{ fontSize: 24, fontWeight: 650 }}>{format(summary.totalFees, 'financial')}</Text><Text style={{ color: theme.pageTextSubdued }}><Trans>Tracked card fees per year.</Trans></Text></Card>
          <Card title={t('Net value')}><Text style={{ color: summary.netValue >= 0 ? theme.noticeText : theme.errorText, fontSize: 24, fontWeight: 650 }}>{format(summary.netValue, 'financial')}</Text><Text style={{ color: theme.pageTextSubdued }}><Trans>Total benefit value minus annual fees.</Trans></Text></Card>
          <Card title={t('Needs attention')}><Text style={{ fontSize: 24, fontWeight: 650 }}>{summary.needsEnrollment + summary.expiringSoon}</Text><Text style={{ color: theme.pageTextSubdued }}>{summary.needsEnrollment} <Trans>not enrolled</Trans> - {summary.expiringSoon} <Trans>reset soon</Trans></Text></Card>
        </View>

        )}

        {activeSection === 'wallet' && (
        <View ref={walletRef} style={{ gap: 14 }}>
          <Text style={{ fontSize: 18, fontWeight: 650 }}><Trans>Card wallet</Trans></Text>
          {lastDeletedRewardCard && (
            <Card title={t('Card deleted')}>
              <View style={{ display: 'grid', gap: 10 }}>
                <Text style={{ color: theme.pageTextSubdued }}>
                  {t('{{cardName}} was removed from the wallet.', {
                    cardName: lastDeletedRewardCard.card.cardName,
                  })}
                </Text>
                <ButtonRow>
                  <Button variant="primary" onPress={restoreLastDeletedRewardCard}>
                    <Trans>Undo delete</Trans>
                  </Button>
                  <Button
                    variant="bare"
                    onPress={() => setLastDeletedRewardCard(null)}
                  >
                    <Trans>Dismiss</Trans>
                  </Button>
                </ButtonRow>
              </View>
            </Card>
          )}
          {matchedTemplates.length > 0 && (
            <Card title={t('Missing wallet cards')}>
              <View style={{ display: 'grid', gap: 10 }}>
                <Text style={{ color: theme.pageTextSubdued }}>
                  {t(
                    '{{count}} linked credit card account is not in this wallet. Restore it without touching existing benefits or annual fees.',
                    { count: matchedTemplates.length },
                  )}
                </Text>
                <ButtonRow>
                  <Button variant="primary" onPress={restoreMissingRewardCards}>
                    <Trans>Recover missing cards</Trans>
                  </Button>
                  <Button
                    variant="normal"
                    onPress={() => setActiveSection('templates')}
                  >
                    <Trans>Review matches</Trans>
                  </Button>
                </ButtonRow>
              </View>
            </Card>
          )}
          {rewardCards.length === 0 ? (
            <Card title={t('No cards yet')}><Text style={{ color: theme.pageTextSubdued }}><Trans>Add reward cards below, then this wallet will become your card-by-card command center.</Trans></Text></Card>
          ) : (
            <View style={{ display: 'grid', gridTemplateColumns: 'minmax(420px, 1.05fr) minmax(360px, 0.95fr)', gap: 18, alignItems: 'stretch' }}>
              <View style={{ backgroundColor: theme.tableBackground, border: `1px solid ${theme.tableBorder}`, borderRadius: 18, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 360, overflow: 'visible', padding: 16 }}>
                <View style={{ alignItems: 'end', display: 'grid', gap: 12, gridTemplateColumns: 'minmax(180px, 1fr) auto' }}>
                  <View><Text style={{ fontSize: 22, fontWeight: 750 }}><Trans>Card wallet</Trans></Text><Text style={{ color: theme.pageTextSubdued }}><Trans>Swipe through cards, then manage rewards and benefits on the right.</Trans></Text></View>
                  <View style={{ textAlign: 'right' }}><Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}><Trans>Tracked cards</Trans></Text><Text style={{ fontSize: 22, fontWeight: 750 }}>{rewardCards.length}</Text></View>
                </View>
                <div ref={walletScrollRef} onScroll={handleRewardWalletScroll} style={{ display: 'flex', flexDirection: 'row', gap: 0, height: 238, overflowX: 'auto', overflowY: 'visible', padding: '10px 120px 24px 4px', scrollBehavior: 'smooth', scrollSnapType: 'x mandatory' }}>
                  {rewardCards.map((card, index) => {
                    const selected = selectedRewardCard?.id === card.id;
                    const pointSystem = getPointSystemForCard(card);
                    const imageUrl = card.imageUrl || findCardArt({ issuer: card.issuer, cardName: card.cardName });
                    return (
                      <div key={card.id} data-card-id={card.id} style={{ flex: '0 0 318px', marginLeft: index === 0 ? 0 : -34, position: 'relative', scrollSnapAlign: 'center', transform: selected ? 'translateY(-2px) scale(1)' : 'translateY(10px) scale(0.94)', transition: 'transform 180ms ease, filter 180ms ease', zIndex: selectedCardIndex >= 0 ? 100 - Math.abs(index - selectedCardIndex) : rewardCards.length - index }}>
                        <button type="button" onClick={() => selectRewardWalletCard(card.id)} style={{ ...(imageUrl ? { background: '#f8fafc' } : getCardArt(card)), aspectRatio: '1.586 / 1', border: selected ? `2px solid ${theme.noticeText}` : '2px solid transparent', borderRadius: 18, boxShadow: selected ? '0 18px 34px rgba(0, 0, 0, 0.28)' : '0 10px 22px rgba(0, 0, 0, 0.18)', color: '#fff', cursor: 'pointer', display: 'block', height: 202, overflow: 'hidden', padding: imageUrl ? 0 : 18, position: 'relative', textAlign: 'left', width: '100%' }}>
                          {imageUrl && <><img src={imageUrl} alt="" aria-hidden="true" style={{ display: 'block', height: '100%', inset: 0, objectFit: 'contain', position: 'absolute', width: '100%' }} /><div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(2, 6, 23, 0) 0%, rgba(2, 6, 23, 0.08) 48%, rgba(2, 6, 23, 0.58) 100%)' }} /></>}
                          <div style={{ bottom: imageUrl ? 14 : undefined, display: 'grid', gap: imageUrl ? 8 : 28, left: imageUrl ? 16 : undefined, position: imageUrl ? 'absolute' : 'relative', right: imageUrl ? 16 : undefined, textShadow: imageUrl ? '0 2px 8px rgba(0, 0, 0, 0.55)' : undefined, zIndex: 1 }}>
                            <div><Text style={{ color: '#fff', fontSize: 12 }}>{card.issuer || t('Card')}</Text><Text style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>{card.cardName || t('Unnamed card')}</Text></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><Text style={{ color: '#fff' }}>{pointSystem?.name || t('No point system')}</Text><Text style={{ color: '#fff', fontWeight: 700 }}>{getPointValueForCard(card)} cpp</Text></div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </View>
              {selectedRewardCard && selectedCardDetails && (
                <Card title={`${selectedRewardCard.issuer} - ${selectedRewardCard.cardName}`}>
                  <ButtonRow><Button variant="normal" onPress={() => startEditRewardCard(selectedRewardCard)}><Trans>Edit card</Trans></Button><Button variant="normal" onPress={() => addRewardForCard(selectedRewardCard)}><Trans>Add reward</Trans></Button><Button variant="normal" onPress={() => addBenefitForCard(selectedRewardCard)}><Trans>Add benefit</Trans></Button><Button variant="normal" onPress={() => addFeeForCard(selectedRewardCard)}><Trans>Add fee</Trans></Button><Button variant="bare" onPress={() => deleteRewardCard(selectedRewardCard.id)}><Trans>Delete card</Trans></Button></ButtonRow>
                  <View style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}><View><Text style={{ color: theme.pageTextSubdued }}><Trans>Available benefits</Trans></Text><Text style={{ fontSize: 20, fontWeight: 650 }}>{format(selectedCardDetails.availableBenefitValue, 'financial')}</Text></View><View><Text style={{ color: theme.pageTextSubdued }}><Trans>Annual fee</Trans></Text><Text style={{ fontSize: 20, fontWeight: 650 }}>{format(selectedCardDetails.totalFees, 'financial')}</Text></View><View><Text style={{ color: theme.pageTextSubdued }}><Trans>Net value</Trans></Text><Text style={{ color: selectedCardDetails.netValue >= 0 ? theme.noticeText : theme.errorText, fontSize: 20, fontWeight: 650 }}>{format(selectedCardDetails.netValue, 'financial')}</Text></View></View>
                  <View style={{ gap: 10 }}><Text style={{ fontWeight: 650 }}><Trans>Rewards</Trans></Text>{selectedCardDetails.multipliers.map(multiplier => <View key={multiplier.id} style={{ borderTop: `1px solid ${theme.tableBorder}`, paddingTop: 8 }}><Text>{t(multiplier.category)} - {safeNumber(multiplier.multiplier)}x - {formatRewardRate(safeNumber(multiplier.multiplier), getPointValueForCard(selectedRewardCard))}</Text></View>)}</View>
                  <View style={{ gap: 10 }}><Text style={{ fontWeight: 650 }}><Trans>Benefits</Trans></Text>{selectedCardDetails.benefits.map(benefit => <View key={benefit.id} style={{ borderTop: `1px solid ${theme.tableBorder}`, paddingTop: 8 }}><Text>{benefit.benefitName} - {format(Math.max(safeAmount(benefit.amountLimit) - safeAmount(benefit.usedAmount), 0), 'financial')} - {t('Next reset')}: {benefit.resetDate}</Text></View>)}</View>
                  <View style={{ gap: 10 }}><Text style={{ fontWeight: 650 }}><Trans>Fees</Trans></Text>{selectedCardDetails.fees.map(fee => <View key={fee.id} style={{ borderTop: `1px solid ${theme.tableBorder}`, paddingTop: 8 }}><Text>{fee.feeDueDate || t('No date')} - {format(fee.annualFee, 'financial')} - {fee.notes || '-'}</Text></View>)}</View>
                </Card>
              )}
            </View>
          )}
        </View>

        )}

        {activeSection === 'templates' && (
        <View ref={templatesRef} style={{ gap: 18 }}><Card title={t('Import starter template')}><PresetFilterBar resultCount={filteredMatchedTemplates.length}><Field label={t('Missing card')}><Select value={filters.templatesCard || ''} options={matchedTemplateFilterOptions} onChange={value => setFilters(current => ({ ...current, templatesCard: value }))} /></Field></PresetFilterBar><FormGrid minColumnWidth={320}><Field label={t('Template')}><Select value={selectedTemplateId} options={templateOptions} onChange={value => setSelectedTemplateId(value)} /></Field></FormGrid><ButtonRow><Button variant="primary" onPress={() => { const template = CARD_TEMPLATES.find(item => item.id === selectedTemplateId); if (template) importTemplateForCard(template); }} isDisabled={!selectedTemplateId}><Trans>Import template</Trans></Button><Button variant="normal" onPress={() => filteredMatchedTemplates.forEach(({ account, template }) => importTemplateForCard(template, account))} isDisabled={filteredMatchedTemplates.length === 0}>{t('Import matches')} ({filteredMatchedTemplates.length})</Button></ButtonRow></Card></View>

        )}

        {activeSection === 'point-systems' && (
        <View ref={pointSystemsRef}><Card title={t('Point systems')}><PresetFilterBar resultCount={filteredPointSystems.length}><Field label={t('Point system')}><Select value={filters.pointSystem || ''} options={pointSystemFilterOptions} onChange={value => setFilters(current => ({ ...current, pointSystem: value }))} /></Field></PresetFilterBar><FormGrid><Field label={t('Point system')}><Input value={pointSystemDraft.name} placeholder={t('Ultimate Rewards, Membership Rewards...')} onChange={event => setPointSystemDraft(current => ({ ...current, name: event.target.value }))} /></Field><Field label={t('Point value / cashback value (cents)')}><Input value={pointSystemDraft.pointValueCents} placeholder="1.5" onChange={event => setPointSystemDraft(current => ({ ...current, pointValueCents: event.target.value }))} /></Field></FormGrid><ButtonRow><Button variant="primary" onPress={onAddPointSystem} isDisabled={!pointSystemDraft.name.trim()}>{editingPointSystemId ? t('Save point system') : t('Add point system')}</Button></ButtonRow>{filteredPointSystems.map(system => <View key={system.id} style={{ borderTop: `1px solid ${theme.tableBorder}`, paddingTop: 10, display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 90px auto', gap: 12, alignItems: 'center' }}><Text style={{ fontWeight: 600 }}>{system.name}</Text><Text>{safeNumber(system.pointValueCents, 1)} cpp</Text><View style={{ flexDirection: 'row', gap: 8 }}><Button variant="normal" onPress={() => startEditPointSystem(system)}><Trans>Edit</Trans></Button><Button variant="bare" onPress={() => deletePointSystem(system.id)}><Trans>Delete</Trans></Button></View></View>)}</Card></View>

        )}

        {activeSection === 'rewards' && (
        <View ref={rewardsRef}><Card title={t('Cashback and points comparison')}><PresetFilterBar resultCount={filteredRewardMultipliers.length}><Field label={t('Card')}><Select value={filters.rewardsCard || ''} options={rewardCardFilterOptions} onChange={value => setFilters(current => ({ ...current, rewardsCard: value }))} /></Field><Field label={t('Spend category')}><Select value={filters.rewardsCategory || ''} options={spendCategoryFilterOptions} onChange={value => setFilters(current => ({ ...current, rewardsCategory: value }))} /></Field></PresetFilterBar><FormGrid><Field label={t('Linked card')}><Select value={rewardCardDraft.accountId || ''} options={accountOptions} onChange={value => onSelectRewardAccount(value)} /></Field><Field label={t('Card name')}><Input value={rewardCardDraft.cardName} onChange={event => setRewardCardDraft(current => ({ ...current, cardName: event.target.value }))} /></Field><Field label={t('Issuer')}><Input value={rewardCardDraft.issuer} onChange={event => setRewardCardDraft(current => ({ ...current, issuer: event.target.value }))} /></Field><Field label={t('Card image URL')}><Input value={rewardCardDraft.imageUrl || ''} placeholder="/card-art/my-card.png or https://..." onChange={event => setRewardCardDraft(current => ({ ...current, imageUrl: event.target.value }))} /></Field><Field label={t('Point system')}><Select value={rewardCardDraft.pointSystemId || ''} options={pointSystemOptions} onChange={value => onSelectRewardPointSystem(value)} /></Field></FormGrid><ButtonRow><Button variant="primary" onPress={onAddRewardCard} isDisabled={!rewardCardDraft.cardName.trim() && !rewardCardDraft.accountId}>{editingRewardCardId ? t('Save card') : t('Add card')}</Button></ButtonRow><FormGrid><Field label={t('Reward card')}><Select value={multiplierDraft.rewardCardId} options={rewardCardOptions} onChange={value => setMultiplierDraft(current => ({ ...current, rewardCardId: value }))} /></Field><Field label={t('Spend category')}><Select value={multiplierDraft.category} options={spendCategoryOptions} onChange={value => setMultiplierDraft(current => ({ ...current, category: value }))} /></Field><Field label={t('Multiplier / cashback percent')}><Input value={String(multiplierDraft.multiplier || '')} placeholder="3" onChange={event => setMultiplierDraft(current => ({ ...current, multiplier: parseNumber(event.target.value, 0) }))} /></Field><Field label={t('Notes')}><Input value={multiplierDraft.notes} onChange={event => setMultiplierDraft(current => ({ ...current, notes: event.target.value }))} /></Field></FormGrid><ButtonRow><Button variant="primary" onPress={onAddMultiplier} isDisabled={!multiplierDraft.rewardCardId}>{editingMultiplierId ? t('Save category rate') : t('Add category rate')}</Button></ButtonRow>{filteredRewardRecommendations.map(row => <View key={row.category} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) minmax(220px, 1.4fr) repeat(2, minmax(90px, 0.6fr))', gap: 12, alignItems: 'center', borderTop: `1px solid ${theme.tableBorder}`, paddingTop: 10 }}><Text>{t(row.category)}</Text><Text>{row.best?.card.cardName || '-'}</Text><Text>{row.best ? `${row.best.multiplier}x` : '-'}</Text><Text>{row.best ? `${row.best.effectiveRate.toFixed(2)}%` : '-'}</Text></View>)}{filteredRewardMultipliers.map(multiplier => { const card = rewardCardsById.get(multiplier.rewardCardId); return <View key={multiplier.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(150px, 1fr) 80px auto', gap: 12, alignItems: 'center', borderTop: `1px solid ${theme.tableBorder}`, paddingTop: 10 }}><Text>{card?.cardName || t('Unknown card')}</Text><Text>{t(multiplier.category)}</Text><Text>{safeNumber(multiplier.multiplier)}x</Text><View style={{ flexDirection: 'row', gap: 8 }}><Button variant="normal" onPress={() => startEditMultiplier(multiplier)}><Trans>Edit</Trans></Button><Button variant="bare" onPress={() => deleteMultiplier(multiplier.id)}><Trans>Delete</Trans></Button></View></View>; })}</Card></View>

        )}

        {activeSection === 'fees' && (
        <View ref={feesRef}><Card title={t('Annual fees')}><PresetFilterBar resultCount={filteredFees.length}><Field label={t('Card')}><Select value={filters.feesCard || ''} options={feeCardFilterOptions} onChange={value => setFilters(current => ({ ...current, feesCard: value }))} /></Field></PresetFilterBar><FormGrid><Field label={t('Linked card')}><Select value={feeDraft.accountId || ''} options={accountOptions} onChange={value => { const account = accounts.find(item => item.id === value); setFeeDraft(current => ({ ...current, accountId: value, cardName: account?.name || current.cardName, issuer: account?.bankName || account?.bank || current.issuer })); }} /></Field><Field label={t('Card name')}><Input value={feeDraft.cardName} onChange={event => setFeeDraft(current => ({ ...current, cardName: event.target.value }))} /></Field><Field label={t('Issuer')}><Input value={feeDraft.issuer} onChange={event => setFeeDraft(current => ({ ...current, issuer: event.target.value }))} /></Field><Field label={t('Annual fee')}><Input value={amountToDollars(feeDraft.annualFee)} onChange={event => setFeeDraft(current => ({ ...current, annualFee: dollarsToAmount(event.target.value) }))} /></Field><Field label={t('Fee due date')}><Input type="date" value={feeDraft.feeDueDate} onChange={event => setFeeDraft(current => ({ ...current, feeDueDate: event.target.value }))} /></Field><Field label={t('Notes')}><Input value={feeDraft.notes} onChange={event => setFeeDraft(current => ({ ...current, notes: event.target.value }))} /></Field></FormGrid><ButtonRow><Button variant="primary" onPress={onAddFee}>{editingFeeId ? t('Save annual fee') : t('Add annual fee')}</Button></ButtonRow>{filteredFees.map(fee => <View key={fee.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 110px 120px auto', gap: 12, alignItems: 'center', borderTop: `1px solid ${theme.tableBorder}`, paddingTop: 10 }}><Text>{[fee.issuer, fee.cardName].filter(Boolean).join(' - ')}</Text><Text>{format(fee.annualFee, 'financial')}</Text><Text>{fee.feeDueDate || '-'}</Text><View style={{ flexDirection: 'row', gap: 8 }}><Button variant="normal" onPress={() => startEditFee(fee)}><Trans>Edit</Trans></Button><Button variant="bare" onPress={() => deleteFee(fee.id)}><Trans>Delete</Trans></Button></View></View>)}</Card></View>

        )}

        {activeSection === 'benefits' && (
        <View ref={benefitsRef}><Card title={t('Tracked benefits')}><PresetFilterBar resultCount={filteredBenefits.length}><Field label={t('Card')}><Select value={filters.benefitsCard || ''} options={benefitCardFilterOptions} onChange={value => setFilters(current => ({ ...current, benefitsCard: value }))} /></Field><Field label={t('Cycle')}><Select value={filters.benefitsPeriod || ''} options={benefitPeriodFilterOptions} onChange={value => setFilters(current => ({ ...current, benefitsPeriod: value }))} /></Field></PresetFilterBar><FormGrid><Field label={t('Linked card')}><Select value={draft.accountId || ''} options={accountOptions} onChange={value => onSelectAccount(value)} /></Field><Field label={t('Card name')}><Input value={draft.cardName} onChange={event => setDraft(current => ({ ...current, cardName: event.target.value }))} /></Field><Field label={t('Issuer')}><Input value={draft.issuer} onChange={event => setDraft(current => ({ ...current, issuer: event.target.value }))} /></Field><Field label={t('Benefit name')}><Input value={draft.benefitName} onChange={event => setDraft(current => ({ ...current, benefitName: event.target.value }))} /></Field><Field label={t('Limit')}><Input value={amountToDollars(draft.amountLimit)} onChange={event => setDraft(current => ({ ...current, amountLimit: dollarsToAmount(event.target.value) }))} /></Field><Field label={t('Used')}><Input value={amountToDollars(draft.usedAmount)} onChange={event => setDraft(current => ({ ...current, usedAmount: dollarsToAmount(event.target.value) }))} /></Field><BenefitCycleFields draft={draft} setDraft={setDraft} t={t} /><Field label={t('Official source URL')}><Input value={draft.sourceUrl} placeholder="https://" onChange={event => setDraft(current => ({ ...current, sourceUrl: event.target.value }))} /></Field><Field label={t('Notes')}><Input value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} /></Field></FormGrid><View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap', marginTop: 14 }}><label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Checkbox checked={draft.enrollmentRequired} onChange={() => setDraft(current => ({ ...current, enrollmentRequired: !current.enrollmentRequired }))} /><Trans>Enrollment required</Trans></label><label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Checkbox checked={draft.enrolled} onChange={() => setDraft(current => ({ ...current, enrolled: !current.enrolled }))} /><Trans>Enrolled</Trans></label></View><ButtonRow><Button variant="primary" onPress={onAddBenefit}>{editingBenefitId ? t('Save benefit') : t('Add benefit')}</Button></ButtonRow>{filteredBenefits.map(benefit => { const remaining = Math.max(safeAmount(benefit.amountLimit) - safeAmount(benefit.usedAmount), 0); return <View key={benefit.id} style={{ borderTop: `1px solid ${theme.tableBorder}`, paddingTop: 10, gap: 10 }}><View style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.4fr) repeat(5, minmax(100px, 0.8fr)) auto', gap: 12, alignItems: 'center' }}><View style={{ minWidth: 0 }}><Text style={{ fontWeight: 600 }}>{benefit.benefitName}</Text><Text style={{ color: theme.pageTextSubdued, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[benefit.issuer, benefit.cardName].filter(Boolean).join(' - ') || t('No card selected')}</Text>{benefit.sourceUrl && <Link variant="external" to={benefit.sourceUrl}><Trans>Official source</Trans></Link>}</View><Text>{t(PERIOD_OPTIONS.find(([value]) => value === benefit.period)?.[1] || 'Annual')}</Text><Text>{t(RESET_TYPE_OPTIONS.find(([value]) => value === (benefit.resetType || 'custom'))?.[1] || 'Custom next reset')}</Text><Text>{benefit.resetDate || t('No date')}</Text><Text>{format(benefit.usedAmount, 'financial')}</Text><Text style={{ fontWeight: 600 }}>{format(remaining, 'financial')}</Text><View style={{ flexDirection: 'row', gap: 8 }}><Button variant="normal" onPress={() => startEditBenefit(benefit)}><Trans>Edit</Trans></Button><Button variant="normal" onPress={() => updateBenefit(benefit.id, { usedAmount: benefit.amountLimit })}><Trans>Mark used</Trans></Button>{benefit.enrollmentRequired && <Button variant="normal" onPress={() => updateBenefit(benefit.id, { enrolled: !benefit.enrolled })}>{benefit.enrolled ? t('Enrolled') : t('Enroll')}</Button>}<Button variant="bare" onPress={() => deleteBenefit(benefit.id)}><Trans>Delete</Trans></Button></View></View></View>; })}</Card></View>
        )}
      </View>
    </Page>
  );
}

