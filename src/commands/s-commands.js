const {
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require('discord.js');

const commandGroups = [
  {
    name: 'HELPER',
    commands: [
      '`/advancedban` - Information about the plugin',
      '`/check` - Get all information about a user',
      '`/history` - See a user\'s history',
      '`/kick` - Kick a user',
      '`/note` - Add a note to a user\'s file',
      '`/notes` - See your or a user\'s notes',
      '`/tempmute` - Mute a user temporarily',
      '`/tempwarn` - Warn a user temporarily',
      '`/warn` - Warn a user permanently',
      '`/warns` - See your or a user\'s warns'
    ]
  },
  {
    name: 'MOD',
    commands: [
      '`/mute` - Mute a user permanently',
      '`/unmute` - Unmute a user',
      '`/tempban` - Ban a user temporarily',
      '`/unwarn` - Delete a warn',
      '`/unnote` - Delete a note'
    ]
  },
  {
    name: 'SRMOD',
    commands: [
      '`/tempipban` - Ban a user temporarily by IP',
      '`/unban` - Unban a user',
      '`/banlist` - See all punishments',
      '`/change-reason` - Change the reason of an existing punishment'
    ]
  },
  {
    name: 'ADMIN',
    commands: [
      '`/ban` - Ban a user permanently',
      '`/ipban` - Ban a user by IP'
    ]
  },
  {
    name: 'SRADMIN',
    commands: [
      '`/unpunish` - Delete a punishment by ID'
    ]
  },
  {
    name: 'MANAGER',
    commands: [
      '`/systemprefs` - Display system preferences for setting up the plugin'
    ]
  }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('s-commands')
    .setDescription('Post the AdvancedBan rank command guide in this channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction, client, config) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'The command guide can only be posted in a server.', ephemeral: true });
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: 'You need Manage Server permission to post the command guide.', ephemeral: true });
    }

    const color = Number.parseInt(String(config.themeColor || '#c6f36b').replace('#', ''), 16);
    const description = commandGroups
      .map((group) => [
        `**# ${group.name}:**`,
        ...group.commands.map((command) => `- ${command}`)
      ].join('\n'))
      .join('\n\n');
    const embed = new EmbedBuilder()
      .setTitle('AdvancedBan Command Guide')
      .setDescription(description);
    if (Number.isFinite(color)) embed.setColor(color);

    await interaction.channel.send({ embeds: [embed] });
    await interaction.reply({
      content: `AdvancedBan command guide posted in <#${interaction.channel.id}>.`,
      ephemeral: true
    });
  }
};
