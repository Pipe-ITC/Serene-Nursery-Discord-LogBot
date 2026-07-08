import { InteractionType } from './constants.js';
import { autocompleteForInteraction } from './autocomplete.js';
import { handleApplicationCommand, handleMessageComponent } from './command-handlers.js';
import { autocompleteChoices, ephemeralMessage, pongResponse } from './responses.js';

export async function handleInteraction(interaction, dependencies = {}) {
  switch (interaction.type) {
    case InteractionType.PING:
      return pongResponse();

    case InteractionType.APPLICATION_COMMAND:
      try {
        return await handleApplicationCommand(interaction, dependencies);
      } catch (error) {
        console.error('Application command failed', error);
        return ephemeralMessage('Sorry, that command failed. Please try again in a moment.');
      }

    case InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE:
      try {
        return autocompleteChoices(await autocompleteForInteraction(interaction, dependencies));
      } catch (error) {
        console.error('Autocomplete failed', error);
        return autocompleteChoices([]);
      }

    case InteractionType.MESSAGE_COMPONENT:
      try {
        return await handleMessageComponent(interaction, dependencies);
      } catch (error) {
        console.error('Message component failed', error);
        return ephemeralMessage('Sorry, that interaction failed. Please try again in a moment.');
      }

    case InteractionType.MODAL_SUBMIT:
      return ephemeralMessage('Modal submissions are not implemented yet.');

    default:
      return ephemeralMessage('Unsupported Discord interaction type.');
  }
}
