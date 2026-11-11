const { SlashCommandBuilder } = require('discord.js');
const { adjustPoints } = require('../tickets/pointsStore');
const { hasPointsAdminRole, sendPointsAdminAudit } = require('../tickets/pointsAdmin');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('s-points')
    .setDescription('Add or remove a staff member’s points.')
    .addUserOption((option) =>
      option.setName('user')
        .setDescription('Staff member whose points to update.')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('action')
        .setDescription('Whether to add or remove points.')
        .setRequired(true)
        .addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' }
        )
    )
    .addIntegerOption((option) =>
      option.setName('amount')
        .setDescription('Number of points to add or remove.')
        .setMinValue(1)
        .setMaxValue(2147483647)
        .setRequired(true)
    ),
  async execute(interaction, client, config) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Staff points can only be changed inside a server.', ephemeral: true });
    }
    if (!await hasPointsAdminRole(interaction, client)) {
      return interaction.reply({ content: 'You need the authorized staff role to use this command.', ephemeral: true });
    }

    const user = interaction.options.getUser('user', true);
    const action = interaction.options.getString('action', true);
    const amount = interaction.options.getInteger('amount', true);
    const balance = adjustPoints(interaction.guildId, user.id, action, amount);
    const verb = action === 'add' ? 'added to' : 'removed from';
    const logMessage = `**Staff points manually updated**\nAction: ${action === 'add' ? '+' : '-'}${amount} points ${verb} <@${user.id}>\nNew balance: ${balance}\nChanged by: <@${interaction.user.id}>\nServer: ${interaction.guildId}\nTime: ${new Date().toISOString()}`;

    try {
      await sendPointsAdminAudit(client, config, logMessage);
    } catch (error) {
      console.error('[POINTS] Could not log manual points change:', error);
      return interaction.reply({
        content: `${amount} points were ${action === 'add' ? 'added to' : 'removed from'} <@${user.id}>. Their new balance is ${balance}. The change was saved, but the audit log failed: ${error.message}`,
        ephemeral: true,
        allowedMentions: { parse: [] }
      });
    }

    await interaction.reply({
      content: `${amount} points ${verb} <@${user.id}>. Their new balance is **${balance}**.`,
      ephemeral: true,
      allowedMentions: { parse: [] }
    });
  }
};
