import { InteractionResponseType, MessageFlags } from './constants.js';

export function pongResponse() {
  return {
    type: InteractionResponseType.PONG,
  };
}

export function ephemeralMessage(content) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content,
      flags: MessageFlags.EPHEMERAL,
    },
  };
}

export function autocompleteChoices(choices) {
  return {
    type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    data: {
      choices,
    },
  };
}
