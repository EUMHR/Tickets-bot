const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  createComponentBuilder
} = require('discord.js');
const { v2ContainerPayload } = require('../dashboard/componentsV2');
const { getTicketOwnerId } = require('./transcriptEngine');
const { getSupportRoleIds } = require('./supportRoles');
const claimingTickets = new Set();

async function claimTicket(interaction, config) {
  const channel = interaction.channel;
  const topic = channel?.topic || '';
  const ownerId = getTicketOwnerId(topic);
  const panelId = topic.match(/(?:^|[|;])panel:([\w-]+)/)?.[1];
  const panel = config.panels.find((item) => item.id === panelId);
  if (!ownerId || !panel) {
    return interaction.reply({ content: 'This is not a managed ticket.', ephemeral: true });
  }

  const staffRoleIds = getSupportRoleIds(panel);
  const canClaim = staffRoleIds.some((roleId) => interaction.member?.roles?.cache?.has(roleId))
    || interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);
  if (!canClaim) {
    return interaction.reply({ content: 'Only configured support staff can claim this ticket.', ephemeral: true });
  }
  if (claimingTickets.has(channel.id)) {
    return interaction.reply({ content: 'A staff member is already claiming this ticket.', ephemeral: true });
  }

  const existingClaim = topic.match(/(?:^|[|;])claimed-by:(\d+)/)?.[1];
  if (existingClaim) {
    return interaction.reply({ content: `This ticket has already been claimed by <@${existingClaim}>.`, ephemeral: true });
  }

  claimingTickets.add(channel.id);
  try {
    await interaction.deferUpdate();
    await channel.setTopic(`${topic}|claimed-by:${interaction.user.id}`, 'Ticket claimed by support staff');
    const container = createComponentBuilder(interaction.message.components[0].toJSON());
    const children = container.toJSON().components || [];
    const rowIndex = children.findIndex((component) => component.type === 1);
    if (rowIndex < 0) throw new Error('Ticket message has no action row to update.');

    const closeButton = new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger);
    const claimedButton = new ButtonBuilder()
      .setCustomId('claim_ticket')
      .setLabel(`Claimed by ${String(interaction.user.username || 'staff').slice(0, 56)}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);
    container.spliceComponents(rowIndex, 1, new ActionRowBuilder().addComponents(closeButton, claimedButton));
    await interaction.editReply(v2ContainerPayload(container));
  } catch (error) {
    await channel.setTopic(topic, 'Restore topic after failed claim').catch(() => {});
    console.error('[TICKETS] Claim failed:', error.message);
    await interaction.followUp({ content: 'Could not claim this ticket. Try again or check the bot channel permissions.', ephemeral: true }).catch(() => {});
    return;
  } finally {
    claimingTickets.delete(channel.id);
  }

  await interaction.followUp({ content: 'Ticket claimed successfully.', ephemeral: true });
}

module.exports = { claimTicket };
