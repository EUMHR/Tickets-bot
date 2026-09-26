const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits
} = require('discord.js');
const { buildTicketWelcome, v2ContainerPayload } = require('../dashboard/componentsV2');
const { getSupportRoleIds } = require('./supportRoles');

const creatingTickets = new Set();

async function createTicket(interaction, client, panel = null, config = {}, alreadyDeferred = false) {
  if (!alreadyDeferred) await interaction.deferReply({ ephemeral: true });
  if (!interaction.inGuild()) {
    return interaction.editReply({ content: 'Tickets can only be opened inside a server.' });
  }
  const key = `${interaction.guildId}:${interaction.user.id}`;
  if (creatingTickets.has(key)) {
    return interaction.editReply({ content: 'Your ticket is already being created.' });
  }

  const ownerMarker = `ticket-owner:${interaction.user.id}`;
  const existing = interaction.guild.channels.cache.find((channel) => {
    const topic = channel.topic || '';
    return topic.includes(ownerMarker) && (!panel || topic.includes(`panel:${panel.id}`));
  });
  if (existing) {
    return interaction.editReply({ content: `You already have an open ticket: ${existing}` });
  }

  creatingTickets.add(key);
  try {
    const username = interaction.user.username
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30) || 'user';
    const supportRoleIds = getSupportRoleIds(panel);
    const parentId = panel?.categoryChannelId || process.env.TICKET_CATEGORY_ID;
    const permissionOverwrites = [
      { id: interaction.guildId, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ]
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels
        ]
      }
    ];

    for (const supportRoleId of supportRoleIds) {
      permissionOverwrites.push({
        id: supportRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ]
      });
    }

    const channel = await interaction.guild.channels.create({
      name: `ticket-${username}-${interaction.user.id.slice(-4)}`,
      type: ChannelType.GuildText,
      topic: `${ownerMarker}${panel ? `|panel:${panel.id}` : ''}`,
      ...(parentId ? { parent: parentId } : {}),
      permissionOverwrites
    });
    const closeButton = new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('Close ticket')
      .setStyle(ButtonStyle.Danger);

    try {
      if (panel) {
        const welcomePanel = buildTicketWelcome(panel, config, interaction.user);
        await channel.send({
          ...v2ContainerPayload(welcomePanel),
          allowedMentions: { roles: supportRoleIds, users: [interaction.user.id] }
        });
      } else {
        await channel.send({
          content: `Welcome ${interaction.user}! Support will be with you shortly.`,
          components: [new ActionRowBuilder().addComponents(closeButton)]
        });
      }
    } catch (error) {
      await channel.delete('Ticket setup failed').catch(() => {});
      throw error;
    }
    await interaction.editReply({ content: `Your ticket is ready: ${channel}` });
  } finally {
    creatingTickets.delete(key);
  }
}

module.exports = { createTicket };
