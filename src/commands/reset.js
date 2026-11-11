const { SlashCommandBuilder } = require('discord.js');
const { resetPoints } = require('../tickets/pointsStore');
const { hasPointsAdminRole, sendPointsAdminAudit } = require('../tickets/pointsAdmin');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Reset all staff points in this server.'),
  async execute(interaction, client, config) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Points can only be reset inside a server.', ephemeral: true });
    }
    if (!await hasPointsAdminRole(interaction, client)) {
      return interaction.reply({ content: 'You need the authorized staff role to use this command.', ephemeral: true });
    }
    const result = resetPoints(interaction.guildId);
    const logMessage = `**Staff points reset**\nReset by: <@${interaction.user.id}>\nCleared: ${result.points} points from ${result.users} staff member(s)\nServer: ${interaction.guildId}\nTime: ${new Date().toISOString()}`;
    try {
      await sendPointsAdminAudit(client, config, logMessage);
    } catch (error) {
      console.error('[POINTS] Could not log points reset:', error);
      return interaction.reply({
        content: `All points were reset for this server (${result.points} points across ${result.users} staff member(s)). Ticket review records were preserved. The reset was saved, but the audit log failed: ${error.message}`,
        ephemeral: true
      });
    }

    await interaction.reply({
      content: `All points were reset for this server (${result.points} points across ${result.users} staff member(s)). Ticket review records were preserved.`,
      ephemeral: true
    });
  }
};
