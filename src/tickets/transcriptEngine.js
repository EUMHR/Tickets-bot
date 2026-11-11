const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');
const { v2Payload } = require('../dashboard/componentsV2');
const { getSupportRoleIds } = require('./supportRoles');
const {
  createPendingReview,
  getPoints,
  getReview,
  markReviewLogged,
  resolveReview
} = require('./pointsStore');
const closingTickets = new Set();
const processingReviews = new Set();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function getTicketOwnerId(topic) {
  return String(topic || '').match(/(?:^|[|;])(?:ticketOwner|ticket-owner):(\d+)(?=$|[|;])/i)?.[1] || null;
}

function getTicketClaimerId(topic) {
  return String(topic || '').match(/(?:^|[|;])claimed-by:(\d+)(?=$|[|;])/i)?.[1] || null;
}

async function fetchTicketMessages(channel) {
  const messages = [];
  let before;
  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!batch.size) break;
    messages.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  messages.sort((left, right) => left.createdTimestamp - right.createdTimestamp);
  return messages;
}

async function createTranscript(channel, messages) {
  if (!messages) messages = await fetchTicketMessages(channel);
  const renderedMessages = messages.map((message) => {
    const authorName = escapeHtml(message.member?.displayName || message.author.globalName || message.author.username);
    const avatar = escapeHtml(message.author.displayAvatarURL({ extension: 'png', size: 64 }));
    const timestamp = escapeHtml(new Date(message.createdTimestamp).toLocaleString());
    const content = escapeHtml(message.content).replace(/\r?\n/g, '<br>');
    const attachments = [...message.attachments.values()].map((attachment) =>
      `<a href="${escapeHtml(attachment.url)}" rel="noopener noreferrer">${escapeHtml(attachment.name || 'Attachment')}</a>`
    ).join('');
    const embeds = message.embeds.map((embed) => {
      const title = embed.title ? `<strong>${escapeHtml(embed.title)}</strong>` : '';
      const description = embed.description ? `<p>${escapeHtml(embed.description).replace(/\r?\n/g, '<br>')}</p>` : '';
      const url = embed.url && /^https?:\/\//i.test(embed.url) ? `<a href="${escapeHtml(embed.url)}" rel="noopener noreferrer">Open link</a>` : '';
      return `<div class="embed">${title}${description}${url}</div>`;
    }).join('');
    const body = [content && `<div class="content">${content}</div>`, attachments && `<div class="attachments">${attachments}</div>`, embeds].filter(Boolean).join('');
    return `<article class="message"><img class="avatar" src="${avatar}" alt=""><div class="message-body"><header><strong>${authorName}</strong><time>${timestamp}</time></header>${body || '<em>Attachment or embed</em>'}</div></article>`;
  }).join('\n');

  const title = escapeHtml(`Transcript: #${channel.name}`);
  const guildName = escapeHtml(channel.guild?.name || 'Discord server');
  return Buffer.from(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline';"><title>${title}</title><style>*{box-sizing:border-box}body{margin:0;background:#171914;color:#e9ebe5;font:14px/1.55 system-ui,sans-serif}.shell{max-width:960px;margin:auto;padding:32px 20px}.head{padding:22px 0 18px;border-bottom:1px solid #363a31}.eyebrow{color:#c6f36b;font:10px monospace;letter-spacing:.12em}.head h1{margin:10px 0 4px;font-size:25px}.head p,time{color:#92978a;font-size:12px}.message{display:flex;gap:12px;padding:17px 0;border-bottom:1px solid #282b25}.avatar{width:34px;height:34px;border-radius:50%;background:#2a2d25}.message-body{min-width:0;flex:1}.message-body header{display:flex;align-items:baseline;gap:9px;margin-bottom:5px}.message-body strong{font-size:13px}.content{white-space:normal;overflow-wrap:anywhere}.attachments{display:flex;flex-wrap:wrap;gap:9px;margin-top:8px}.attachments a,.embed a{color:#c6f36b}.embed{margin-top:8px;padding:10px 12px;border-left:3px solid #778e4a;background:#20221e}.embed p{margin:4px 0}.empty{padding:30px 0;color:#92978a}@media(max-width:540px){.shell{padding:20px 14px}.head h1{font-size:20px}}</style></head><body><main class="shell"><header class="head"><div class="eyebrow">TICKET TRANSCRIPT</div><h1>${title}</h1><p>${guildName} · ${messages.length} messages</p></header>${renderedMessages || '<div class="empty">No messages in this ticket.</div>'}</main></body></html>`, 'utf8');
}

async function findFirstStaffResponder(messages, guild, ownerId, panel) {
  const supportRoleIds = getSupportRoleIds(panel);
  for (const message of messages) {
    if (message.author.bot || message.author.id === ownerId) continue;
    let member = message.member;
    if (!member) {
      try {
        member = await guild.members.fetch(message.author.id);
      } catch (error) {
        if (error.code !== 10007) throw error;
        continue;
      }
    }
    const hasSupportRole = supportRoleIds.some((roleId) => member.roles.cache.has(roleId));
    const isManager = member.permissions.has(PermissionFlagsBits.ManageGuild)
      || member.permissions.has(PermissionFlagsBits.ManageChannels);
    if (hasSupportRole || isManager || message.author.id === guild.ownerId) return message.author.id;
  }
  return null;
}

function buildReviewComponents(review) {
  const row = new ActionRowBuilder();
  if (review.staffId) {
    row.addComponents(new ButtonBuilder()
      .setCustomId('ticket_points_approve')
      .setLabel('Approve +2 points')
      .setStyle(ButtonStyle.Success));
  }
  row.addComponents(new ButtonBuilder()
    .setCustomId('ticket_points_reject')
    .setLabel('No points')
    .setStyle(ButtonStyle.Danger));
  return [row];
}

function buildReviewPayload(review) {
  return {
    content: review.staffId
      ? `Ticket closed and transcript sent to the opener. First staff responder: <@${review.staffId}>. A manager or the server owner must approve or reject the 2-point award below.`
      : 'Ticket closed and transcript sent to the opener. No eligible staff response was found, so no points can be awarded. A manager or the server owner can finalize this ticket below.',
    components: buildReviewComponents(review),
    allowedMentions: { parse: [] }
  };
}

async function closeTicket(interaction, client, config, transcriptDirectory) {
  await interaction.deferReply({ ephemeral: true });
  const channel = interaction.channel;
  const ownerId = getTicketOwnerId(channel?.topic);
  const panelId = channel?.topic?.match(/panel:([\w-]+)/)?.[1];
  const panel = config.panels.find((item) => item.id === panelId);
  const isOwner = ownerId === interaction.user.id;
  const isSupport = getSupportRoleIds(panel).some((roleId) => interaction.member?.roles?.cache?.has(roleId));
  const isModerator = interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);

  if (!ownerId) {
    return interaction.editReply({ content: 'This channel is not a ticket.' });
  }
  if (!isOwner && !isSupport && !isModerator) {
    return interaction.editReply({ content: 'Only the ticket owner or support staff can close this ticket.' });
  }
  if (closingTickets.has(channel.id)) {
    return interaction.editReply({ content: 'This ticket is already closing.' });
  }
  const pendingReview = getReview(channel.id);
  if (pendingReview?.status === 'pending') {
    const recentMessages = await channel.messages.fetch({ limit: 100 });
    const hasReviewPrompt = recentMessages.some((message) =>
      message.author.id === client.user.id
      && message.components.some((row) =>
        row.components.some((component) => component.customId?.startsWith('ticket_points_'))
      )
    );
    if (!hasReviewPrompt) await channel.send(buildReviewPayload(pendingReview));
    return interaction.editReply({ content: 'This ticket is already closed and awaiting a points review.' });
  }
  if (channel.topic?.includes('ticket-closed:1')) {
    return interaction.editReply({ content: 'This ticket is already closed.' });
  }

  closingTickets.add(channel.id);

  try {
    const messages = await fetchTicketMessages(channel);
    const transcript = await createTranscript(channel, messages);
    const staffId = await findFirstStaffResponder(messages, interaction.guild, ownerId, panel);
    const guildDirectory = path.join(transcriptDirectory, interaction.guildId);
    fs.mkdirSync(guildDirectory, { recursive: true });
    const ticketId = `${Date.now().toString(36)}${crypto.randomBytes(5).toString('hex')}`;
    const filePath = path.join(guildDirectory, `${ticketId}.html`);
    fs.writeFileSync(filePath, transcript);

    const domain = String(config.domainUrl || process.env.DOMAIN_URL || '').replace(/\/$/, '');
    const transcriptUrl = domain
      ? `${domain}/transcripts/${interaction.guildId}/${ticketId}`
      : null;

    if (ownerId) {
      try {
        const owner = await client.users.fetch(ownerId);
        await owner.send({
          content: `Your ticket is closed. Here is your transcript${transcriptUrl ? `: ${transcriptUrl}` : '.'}`,
          files: [{ attachment: transcript, name: `${channel.name}-transcript.html` }]
        });
      } catch (error) {
        console.warn('[TRANSCRIPTS] Could not DM ticket transcript file:', error.message);
        if (transcriptUrl) {
          try {
            const owner = await client.users.fetch(ownerId);
            await owner.send(v2Payload(`## Ticket closed\nYour ticket transcript is ready: ${transcriptUrl}`));
          } catch (linkError) {
            console.warn('[TRANSCRIPTS] Could not DM ticket transcript link:', linkError.message);
          }
        }
      }
    }

    if (config.ticketLogChannelId) {
      const logChannel = await client.channels.fetch(config.ticketLogChannelId).catch(() => null);
      if (logChannel?.isTextBased() && logChannel.send) {
        const linkLine = transcriptUrl ? `\n**Transcript:** ${transcriptUrl}` : `\n**Transcript file:** ${ticketId}.html`;
        await logChannel.send(v2Payload(
          `## Ticket closed\n**Channel:** #${channel.name}\n**Closed by:** <@${interaction.user.id}>\n**Ticket owner:** <@${ownerId}>${linkLine}`
        ));
      }
    }

    if (!getTicketClaimerId(channel.topic)) {
      await interaction.editReply({
        content: 'Ticket closed without a claimer. The transcript was sent to the opener and the ticket is being deleted.'
      });
      try {
        await channel.delete('Ticket closed without a claimer');
      } catch (error) {
        console.error('[TICKETS] Could not delete closed ticket without a claimer:', error);
        await interaction.editReply({
          content: 'The transcript was sent, but the ticket could not be deleted. Check the bot’s Manage Channels permission.'
        });
      }
      closingTickets.delete(channel.id);
      return;
    }

    await channel.setTopic(`${channel.topic || ''}|ticket-closed:1`, 'Ticket closed for points review');
    const review = {
      channelId: channel.id,
      guildId: interaction.guildId,
      channelName: channel.name,
      ticketOwnerId: ownerId,
      staffId,
      guildOwnerId: interaction.guild.ownerId,
      transcriptId: ticketId,
      closedBy: interaction.user.id,
      pointsLogChannelId: config.pointsLogChannelId || '',
      points: 2
    };
    await channel.permissionOverwrites.edit(ownerId, {
      ViewChannel: false,
      SendMessages: false,
      ReadMessageHistory: false
    }, { reason: 'Ticket closed; awaiting staff points review' });
    createPendingReview(review);
    await channel.send(buildReviewPayload(review));
    await interaction.editReply({
      content: 'Ticket closed and the opener access was removed. It will be deleted after a manager or the server owner completes the points review.'
    });
    closingTickets.delete(channel.id);
  } catch (error) {
    closingTickets.delete(channel.id);
    console.error('[TRANSCRIPTS] Could not create ticket transcript:', error);
    await interaction.editReply({
      content: 'Transcript creation failed. The ticket channel was not deleted.'
    }).catch(() => {});
  }
}

async function sendPointsAudit(client, review, config) {
  const logChannelId = config.pointsLogChannelId || review.pointsLogChannelId;
  if (!logChannelId) {
    throw new Error('Set the points review log channel in the dashboard settings before finalizing this review.');
  }
  const channel = await client.channels.fetch(logChannelId);
  if (!channel?.isTextBased() || !channel.send) {
    throw new Error('The configured points review log channel is not a text channel the bot can access.');
  }
  const approved = review.status === 'approved';
  const balance = review.staffId ? getPoints(review.guildId, review.staffId) : 0;
  const domain = String(config.domainUrl || process.env.DOMAIN_URL || '').replace(/\/$/, '');
  const transcriptUrl = domain
    ? `${domain}/transcripts/${review.guildId}/${review.transcriptId}`
    : null;
  const embed = buildTicketPointsEmbed(review, balance, transcriptUrl);
  await channel.send({
    embeds: [embed],
    allowedMentions: { parse: [] }
  });
  markReviewLogged(review.channelId);
}

function buildTicketPointsEmbed(review, balance, transcriptUrl) {
  const approved = review.status === 'approved';
  return new EmbedBuilder()
    .setColor(approved ? 0x57f287 : 0xed4245)
    .setTitle(`Ticket #${review.channelName}`)
    .addFields(
      { name: 'Ticket Opener', value: review.ticketOwnerId ? `<@${review.ticketOwnerId}>` : 'Unknown', inline: false },
      { name: 'Support Member', value: review.staffId ? `<@${review.staffId}>` : 'None', inline: false },
      { name: 'Points Now', value: String(balance), inline: true },
      { name: 'Points Added', value: approved ? `+${review.points}` : '0', inline: true },
      {
        name: 'Transcript',
        value: transcriptUrl ? `[Open transcript](${transcriptUrl})` : `Saved as \`${review.transcriptId}.html\``,
        inline: false
      },
      { name: 'Ticket ID', value: review.channelId, inline: true },
      { name: 'Reviewed By', value: `<@${review.reviewerId}>`, inline: true }
    )
    .setTimestamp(new Date(review.reviewedAt));
}

function canReviewPoints(interaction, review) {
  if (interaction.user.id === review.guildOwnerId) return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) return true;
  return false;
}

async function handlePointsReview(interaction, client, config) {
  const channel = interaction.channel;
  if (!channel || processingReviews.has(channel.id)) {
    return interaction.reply({ content: 'This points review is already being processed.', ephemeral: true });
  }
  const review = getReview(channel.id);
  if (!review) {
    return interaction.reply({ content: 'This ticket has no pending points review.', ephemeral: true });
  }
  if (!canReviewPoints(interaction, review)) {
    return interaction.reply({ content: 'Only configured support managers or the server owner can review ticket points.', ephemeral: true });
  }
  if (review.guildId !== interaction.guildId) {
    return interaction.reply({ content: 'This review belongs to a different server.', ephemeral: true });
  }

  processingReviews.add(channel.id);
  try {
    await interaction.deferUpdate();
    const action = interaction.customId === 'ticket_points_approve';
    const resolved = review.status === 'pending'
      ? resolveReview(channel.id, action, interaction.user.id)
      : review;
    if (resolved.status === 'pending') {
      throw new Error(`Unexpected pending state for ticket ${channel.id}.`);
    }

    try {
      if (!resolved.logged) await sendPointsAudit(client, resolved, config);
      await interaction.message.edit({
        content: `Points review ${resolved.status}. ${resolved.status === 'approved' ? '2 points were awarded.' : 'No points were awarded.'} This ticket will be deleted shortly.`,
        components: []
      });
      setTimeout(() => {
        channel.delete('Ticket points review completed.').catch((error) => {
          console.error('[TICKETS] Could not delete reviewed ticket:', error);
        }).finally(() => closingTickets.delete(channel.id));
      }, 5000);
    } catch (error) {
      console.error('[POINTS] Could not write points audit log:', error);
      await interaction.message.edit({
        content: `The decision was saved${resolved.status === 'approved' ? ' and the 2 points were awarded' : ''}, but the audit log could not be sent: ${error.message} Configure the points log channel, then retry.`,
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('ticket_points_retry')
            .setLabel('Retry audit log')
            .setStyle(ButtonStyle.Secondary)
        )]
      });
    }
  } finally {
    processingReviews.delete(channel.id);
  }
}

module.exports = {
  closeTicket,
  createTranscript,
  buildTicketPointsEmbed,
  escapeHtml,
  getTicketClaimerId,
  getTicketOwnerId,
  handlePointsReview
};
