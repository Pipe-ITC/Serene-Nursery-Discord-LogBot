import { searchFlowerChoices } from '../flowers/search.js';
import { rarityChoices } from './rarities.js';
import { focusedOption } from './options.js';

const flowerOptionNames = new Set(['flower', 'flower_pattern']);
const rarityOptionNames = new Set(['rarity']);

export async function autocompleteForInteraction(interaction, dependencies = {}) {
  const searchFlowers = dependencies.searchFlowerChoices ?? searchFlowerChoices;
  const option = focusedOption(interaction?.data?.options);

  if (!option) {
    return [];
  }

  if (flowerOptionNames.has(option.name)) {
    return searchFlowers(option.value);
  }

  if (rarityOptionNames.has(option.name)) {
    return rarityChoices(option.value);
  }

  return [];
}
