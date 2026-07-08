export function focusedOption(options = []) {
  for (const option of options) {
    if (option.focused) {
      return option;
    }

    const nested = focusedOption(option.options);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

export function optionValue(options = [], name) {
  for (const option of options) {
    if (option.name === name) {
      return option.value;
    }
  }

  return undefined;
}

export function userIdFromInteraction(interaction) {
  return interaction?.member?.user?.id ?? interaction?.user?.id;
}

export function displayNameForUser(discordUserId, user = {}) {
  const gameName = user.game_name?.trim();
  const mention = `<@${discordUserId}>`;

  return gameName ? `${gameName} (${mention})` : mention;
}
