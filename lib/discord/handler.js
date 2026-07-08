import { InteractionType } from './constants.js';
import { autocompleteForInteraction } from './autocomplete.js';
import { autocompleteChoices, ephemeralMessage, pongResponse } from './responses.js';

function commandName(interaction) {
  return interaction?.data?.name ?? 'unknown';
}

function componentId(interaction) {
  return interaction?.data?.custom_id ?? 'unknown';
}

export async function handleInteraction(interaction) {
  switch (interaction.type) {
    case InteractionType.PING:
      return pongResponse();

    case InteractionType.APPLICATION_COMMAND:
      return ephemeralMessage(`Command /${commandName(interaction)} is not implemented yet.`);

    case InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE:
      try {
        return autocompleteChoices(await autocompleteForInteraction(interaction));
      } catch (error) {
        console.error('Autocomplete failed', error);
        return autocompleteChoices([]);
      }

    case InteractionType.MESSAGE_COMPONENT:
      return ephemeralMessage(`Component ${componentId(interaction)} is not implemented yet.`);

    case InteractionType.MODAL_SUBMIT:
      return ephemeralMessage('Modal submissions are not implemented yet.');

    default:
      return ephemeralMessage('Unsupported Discord interaction type.');
  }
}
