const RARITY_EMOJI_DEFAULTS = {
  N: '1524529507942404186',
  R: '1524529635256307852',
  SR: '1524529711823454389',
  SSR: '1524529771227381941',
  UR: '1524529822653612255',
};

const RARITY_EMOJI_NAMES = {
  N: 'N',
  R: 'R',
  SR: 'SR',
  SSR: 'SSR',
  UR: 'UR',
};

export function rarityEmoji(rarity) {
  const emojiId = process.env[`EMOJI_${rarity}`] ?? RARITY_EMOJI_DEFAULTS[rarity];
  const emojiName = RARITY_EMOJI_NAMES[rarity];

  return emojiId && emojiName ? `<:${emojiName}:${emojiId}>` : rarity;
}

export function rarityDisplay(rarity) {
  return rarity ? rarityEmoji(rarity) : 'all rarities';
}
