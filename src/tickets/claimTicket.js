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

function getTicketClaimData(channel, config) {
  const topic = channel?.topic || '';
  const ownerId = getTicketOwnerId(topic);
  const panelId = topic.match(/(?:^|[|;])panel:([\w-]+)/)?.[1];
  const panel = config.panels.find((item) => item.id === panelId);
  return ownerId && panel ? { topic, ownerId, panel } : null;
}

function canClaim(member, panel) {
  return getSupportRoleIds(panel).some((roleId) => member?.roles?.cache?.has(roleId))
    || member?.permissions?.has(PermissionFlagsBits.ManageChannels)
    || member?.permissions?.has(PermissionFlagsBits.ManageGuild);
}

async function updateClaimMessage(channel, client, claimedUser) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const welcome = messages.find((message) =>
    message.author.id === client.user.id
    && message.components.some((container) =>
      container.toJSON().components?.some((row) =>
        row.type === 1
        && row.components?.some((button) => button.custom_id === 'claim_ticket')
      )
    )
  );
  if (!welcome) return;

  const container = createComponentBuilder(welcome.components[0].toJSON());
  const children = container.toJSON().components || [];
  const rowIndex = children.findIndex((component) =>
    component.type === 1
    && component.components?.some((button) => button.custom_id === 'claim_ticket')
  );
  if (rowIndex < 0) return;

  const closeButton = new ButtonBuilder()
    .setCustomId('close_ticket')
    .setLabel('Close Ticket')
    .setStyle(ButtonStyle.Danger);
  const claimedButton = new ButtonBuilder()
    .setCustomId('claim_ticket')
    .setLabel(`Claimed by ${String(claimedUser.username || 'staff').slice(0, 56)}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);
  container.spliceComponents(rowIndex, 1, new ActionRowBuilder().addComponents(closeButton, claimedButton));
  await welcome.edit(v2ContainerPayload(container));
}

async function finalizeClaim(channel, client, topic, ownerId, user) {
  if (user.id === ownerId) return false;
  if (claimingTickets.has(channel.id) || topic.match(/(?:^|[|;])claimed-by:(\d+)/)?.[1]) {
    return false;
  }
  claimingTickets.add(channel.id);
  try {
    await channel.setTopic(`${topic}|claimed-by:${user.id}`, 'Ticket claimed by first support responder');
    await updateClaimMessage(channel, client, user);
    await channel.send({
      content: `This ticket was claimed by <@${user.id}>.`,
      allowedMentions: { users: [user.id] }
    });
    return true;
  } finally {
    claimingTickets.delete(channel.id);
  }
}

async function autoClaimTicket(message, config) {
  if (!message.guild || message.author.bot) return;
  const ticket = getTicketClaimData(message.channel, config);
  if (!ticket || ticket.ownerId === message.author.id || ticket.topic.includes('ticket-closed:1')) return;
  const member = message.member || await message.guild.members.fetch(message.author.id);
  if (!canClaim(member, ticket.panel)) return;

  try {
    await finalizeClaim(message.channel, message.client, ticket.topic, ticket.ownerId, message.author);
  } catch (error) {
    console.error('[TICKETS] Automatic claim failed:', error);
    throw error;
  }
}

async function claimTicket(interaction, config) {
  const channel = interaction.channel;
  const ticket = getTicketClaimData(channel, config);
  if (!ticket) {
    return interaction.reply({ content: 'This is not a managed ticket.', ephemeral: true });
  }
  if (!canClaim(interaction.member, ticket.panel)) {
    return interaction.reply({ content: 'Only configured support staff can claim this ticket.', ephemeral: true });
  }
  if (interaction.user.id === ticket.ownerId) {
    return interaction.reply({ content: 'The ticket opener cannot claim their own ticket.', ephemeral: true });
  }
  if (claimingTickets.has(channel.id)) {
    return interaction.reply({ content: 'A staff member is already claiming this ticket.', ephemeral: true });
  }

  const existingClaim = ticket.topic.match(/(?:^|[|;])claimed-by:(\d+)/)?.[1];
  if (existingClaim) {
    return interaction.reply({ content: `This ticket has already been claimed by <@${existingClaim}>.`, ephemeral: true });
  }

  try {
    await interaction.deferUpdate();
    const claimed = await finalizeClaim(channel, interaction.client, ticket.topic, ticket.ownerId, interaction.user);
    if (!claimed) {
      await interaction.followUp({ content: 'This ticket has already been claimed by another staff member.', ephemeral: true });
      return;
    }
    await interaction.followUp({ content: 'Ticket claimed successfully.', ephemeral: true });
  } catch (error) {
    await channel.setTopic(ticket.topic, 'Restore topic after failed claim').catch(() => {});
    console.error('[TICKETS] Claim failed:', error);
    await interaction.followUp({ content: 'Could not claim this ticket. Try again or check the bot channel permissions.', ephemeral: true }).catch(() => {});
  }
}

module.exports = { autoClaimTicket, claimTicket };
