const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { buildPanel } = require('../dashboard/buildPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Post a ticket creation panel in this channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option.setName('message')
        .setDescription('Short introduction shown above the ticket button.')
        .setMaxLength(1000)
    ),
  async execute(interaction) {
    const message = interaction.options.getString('message') || 'Need a hand? Open a ticket and our team will help you out.';
    await interaction.deferReply({ ephemeral: true });
    const payload = buildPanel([
      { type: 'text', text: message },
      { type: 'row', label: 'Create ticket', emoji: '🎫' }
    ]);
    await interaction.channel.send(payload);
    await interaction.editReply({ content: 'Ticket panel posted.' });
  }
};
