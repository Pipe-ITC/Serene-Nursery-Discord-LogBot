const optionType = {
  STRING: 3,
  INTEGER: 4,
  USER: 6,
};

function flowerOption(description = 'Flower name') {
  return {
    type: optionType.STRING,
    name: 'flower',
    description,
    required: true,
    autocomplete: true,
  };
}

function rarityOption(required = false) {
  return {
    type: optionType.STRING,
    name: 'rarity',
    description: 'Flower rarity',
    required,
    autocomplete: true,
  };
}

function userOption(description) {
  return {
    type: optionType.USER,
    name: 'user',
    description,
    required: true,
  };
}

export const discordCommands = [
  {
    name: 'help',
    description: 'Show available bot commands',
  },
  {
    name: 'log',
    description: 'Log a flower you own',
    options: [
      flowerOption('Flower to log'),
      {
        type: optionType.INTEGER,
        name: 'extra_points',
        description: 'Optional extra points added to this flower',
        required: false,
        min_value: 0,
      },
    ],
  },
  {
    name: 'addpoints',
    description: 'Add extra points to a logged flower',
    options: [
      flowerOption('Flower to update'),
      {
        type: optionType.INTEGER,
        name: 'points',
        description: 'Extra points to store for this flower',
        required: true,
        min_value: 0,
      },
    ],
  },
  {
    name: 'del',
    description: 'Remove a logged flower',
    options: [flowerOption('Flower to remove')],
  },
  {
    name: 'logall',
    description: 'Log multiple matching flowers',
    options: [
      {
        type: optionType.STRING,
        name: 'flower_pattern',
        description: 'Text to match within flower names',
        required: true,
      },
    ],
  },
  {
    name: 'setlevel',
    description: 'Log flowers assigned up to a level',
    options: [
      {
        type: optionType.INTEGER,
        name: 'level',
        description: 'Assignment level',
        required: true,
        min_value: 0,
      },
    ],
  },
  {
    name: 'find',
    description: 'Find who owns a flower',
    options: [flowerOption('Flower to find')],
  },
  {
    name: 'findpoints',
    description: 'List flowers with specific quest points',
    options: [
      {
        type: optionType.INTEGER,
        name: 'points',
        description: 'Fixed flower quest points',
        required: true,
        min_value: 0,
      },
    ],
  },
  {
    name: 'findrarity',
    description: 'List flowers with a specific rarity',
    options: [rarityOption(true)],
  },
  {
    name: 'points',
    description: 'View a flower quest points',
    options: [flowerOption('Flower to inspect')],
  },
  {
    name: 'info',
    description: 'View flower collection details',
    options: [flowerOption('Flower to inspect')],
  },
  {
    name: 'setname',
    description: 'Set your Cozy Florist game name',
    options: [
      {
        type: optionType.STRING,
        name: 'name',
        description: 'Your game name',
        required: true,
        max_length: 80,
      },
    ],
  },
  {
    name: 'count',
    description: 'View your collection progress',
    options: [rarityOption(false)],
  },
  {
    name: 'pin',
    description: 'Toggle a flower pin',
    options: [flowerOption('Flower to pin or unpin')],
  },
  {
    name: 'pinned',
    description: 'View pinned flowers',
    options: [
      {
        type: optionType.USER,
        name: 'user',
        description: 'Discord user to inspect',
        required: false,
      },
    ],
  },
  {
    name: 'addflower',
    description: 'Admin: add a new flower',
    options: [
      {
        type: optionType.STRING,
        name: 'name',
        description: 'Flower name',
        required: true,
        max_length: 100,
      },
      rarityOption(true),
      {
        type: optionType.INTEGER,
        name: 'quest_points',
        description: 'Fixed quest points',
        required: true,
        min_value: 0,
      },
      {
        type: optionType.INTEGER,
        name: 'assignment_level',
        description: 'Optional assignment level',
        required: false,
        min_value: 0,
      },
      {
        type: optionType.STRING,
        name: 'image_url',
        description: 'Optional image or icon URL',
        required: false,
      },
    ],
  },
  {
    name: 'pinned-flowers',
    description: 'Admin: show flowers pinned by players',
    options: [rarityOption(false)],
  },
  {
    name: 'pinned-players',
    description: 'Admin: show players with pinned flowers',
  },
  {
    name: 'addadmin',
    description: 'Admin: promote a user to app admin',
    options: [userOption('Discord user to promote')],
  },
  {
    name: 'removeadmin',
    description: 'Admin: remove an app admin',
    options: [userOption('Discord user to remove')],
  },
  {
    name: 'removeuser',
    description: 'Admin: remove a player and their flower data',
    options: [userOption('Discord user to remove from the bot')],
  },
  {
    name: 'addplayerflowers',
    description: 'Admin: add matching flowers to a player',
    options: [
      {
        type: optionType.USER,
        name: 'user',
        description: 'Discord user to update',
        required: true,
      },
      {
        type: optionType.STRING,
        name: 'flower_pattern',
        description: 'Text to match within flower names',
        required: true,
      },
    ],
  },
];
