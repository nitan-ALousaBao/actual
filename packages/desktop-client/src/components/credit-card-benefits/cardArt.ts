export type CardArtMatchInput = {
  issuer?: string;
  cardName?: string;
  accountName?: string;
};

type CardArtPreset = {
  path: string;
  aliases: string[];
};

export const CARD_ART_PRESETS: CardArtPreset[] = [
  {
    path: '/card-art/amex-gold.png',
    aliases: ['american express gold', 'amex gold', 'gold card'],
  },
  {
    path: '/card-art/amex-platinum.png',
    aliases: ['american express platinum', 'amex platinum', 'platinum card'],
  },
  {
    path: '/card-art/amex-blue-cash-preferred.png',
    aliases: ['blue cash preferred', 'bcp'],
  },
  {
    path: '/card-art/amex-hilton-honors.png',
    aliases: ['hilton honors card', 'hilton honors amex'],
  },
  {
    path: '/card-art/amex-hilton-surpass.png',
    aliases: ['hilton honors surpass', 'hilton surpass', 'surpass card'],
  },
  {
    path: '/card-art/amex-hilton-aspire.png',
    aliases: ['hilton honors aspire', 'hilton aspire', 'aspire card'],
  },
  {
    path: '/card-art/amex-marriott-bonvoy-business.png',
    aliases: ['marriott bonvoy business', 'bonvoy business'],
  },
  {
    path: '/card-art/amex-marriott-bonvoy-brilliant.png',
    aliases: ['marriott bonvoy brilliant', 'bonvoy brilliant'],
  },
  {
    path: '/card-art/amex-delta-skymiles-gold.png',
    aliases: ['delta skymiles gold', 'skymiles gold'],
  },
  {
    path: '/card-art/chase-sapphire-preferred.webp',
    aliases: ['chase sapphire preferred', 'sapphire preferred', 'csp'],
  },
  {
    path: '/card-art/chase-sapphire-reserve.webp',
    aliases: ['chase sapphire reserve', 'sapphire reserve', 'csr'],
  },
  {
    path: '/card-art/chase-freedom-flex.webp',
    aliases: ['chase freedom flex', 'freedom flex', 'cff'],
  },
  {
    path: '/card-art/chase-freedom-unlimited.webp',
    aliases: ['chase freedom unlimited', 'freedom unlimited', 'cfu'],
  },
  {
    path: '/card-art/chase-marriott-bonvoy-boundless.webp',
    aliases: ['marriott bonvoy boundless', 'bonvoy boundless', 'boundless'],
  },
  {
    path: '/card-art/chase-united-explorer.webp',
    aliases: ['united explorer', 'explorer card'],
  },
  {
    path: '/card-art/capital-one-venture-x.png',
    aliases: ['capital one venture x', 'venture x'],
  },
  {
    path: '/card-art/capital-one-savor.png',
    aliases: ['capital one savor', 'savorone', 'savor'],
  },
  {
    path: '/card-art/citi-custom-cash.webp',
    aliases: ['citi custom cash', 'custom cash'],
  },
  {
    path: '/card-art/bilt-mastercard.png',
    aliases: ['bilt mastercard', 'bilt'],
  },
  {
    path: '/card-art/wells-fargo-autograph.jpg',
    aliases: ['wells fargo autograph', 'autograph card'],
  },
];

function normalize(value?: string) {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function findCardArt(input: CardArtMatchInput) {
  const haystack = normalize(
    `${input.issuer || ''} ${input.cardName || ''} ${input.accountName || ''}`,
  );

  if (!haystack) {
    return undefined;
  }

  return CARD_ART_PRESETS.find(preset =>
    preset.aliases.some(alias => haystack.includes(normalize(alias))),
  )?.path;
}


