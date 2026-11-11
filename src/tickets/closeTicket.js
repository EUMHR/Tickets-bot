const { PermissionFlagsBits } = require('discord.js');

const closingTickets = new Set();

async function closeTicket(interaction) {
  const channel = interaction.channel;
  const ownerId = channel?.topic?.match(/^ticket-owner:(\d+)$/)?.[1];
  if (!ownerId) {
    return interaction.reply({ content: 'This command can only be used inside a ticket channel.', ephemeral: true });
  }

  const isOwner = ownerId === interaction.user.id;
  const isModerator = interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);
  if (!isOwner && !isModerator) {
    return interaction.reply({
      content: 'Only the ticket owner or a moderator can close this ticket.',
      ephemeral: true
    });
  }

  if (closingTickets.has(channel.id)) {
    return interaction.reply({ content: 'This ticket is already closing.', ephemeral: true });
  }

  closingTickets.add(channel.id);
  try {
    if (interaction.isButton()) {
      await interaction.update({
        content: 'This ticket will close in 5 seconds.',
        components: []
      });
    } else {
      await interaction.reply({ content: 'This ticket will close in 5 seconds.' });
    }
  } catch (error) {
    closingTickets.delete(channel.id);
    throw error;
  }

  setTimeout(() => {
    channel.delete('Ticket closed').catch((error) => {
      console.error('[TICKETS] Could not delete ticket:', error.message);
    }).finally(() => closingTickets.delete(channel.id));
  }, 5000);
}

module.exports = { closeTicket };
