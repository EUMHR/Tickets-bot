const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PermissionFlagsBits } = require('discord.js');
const { v2Payload } = require('../dashboard/componentsV2');
const { getSupportRoleIds } = require('./supportRoles');
const closingTickets = new Set();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function getTicketOwnerId(topic) {
  return String(topic || '').match(/(?:^|[|;])(?:ticketOwner|ticket-owner):(\d+)(?=$|[|;])/i)?.[1] || null;
}

async function createTranscript(channel) {
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

async function closeTicket(interaction, client, config, transcriptDirectory) {
  await interaction.deferReply({ ephemeral: true });
  const channel = interaction.channel;
  const ownerId = getTicketOwnerId(channel?.topic);
  const panelId = channel?.topic?.match(/panel:([\w-]+)/)?.[1];
  const panel = config.panels.find((item) => item.id === panelId);
  const isOwner = ownerId === interaction.user.id;
  const isSupport = panel && getSupportRoleIds(panel).some((roleId) => interaction.member?.roles?.cache?.has(roleId));
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

  closingTickets.add(channel.id);

  try {
    await channel.send(v2Payload('The ticket is closing and its transcript is being saved.'));
    const transcript = await createTranscript(channel);
    const guildDirectory = path.join(transcriptDirectory, interaction.guildId);
    fs.mkdirSync(guildDirectory, { recursive: true });
    const ticketId = `${Date.now().toString(36)}${crypto.randomBytes(5).toString('hex')}`;
    const filePath = path.join(guildDirectory, `${ticketId}.html`);
    fs.writeFileSync(filePath, transcript);

    const domain = String(config.domainUrl || process.env.DOMAIN_URL || '').replace(/\/$/, '');
    const transcriptUrl = domain
      ? `${domain}/transcripts/${interaction.guildId}/${ticketId}`
      : null;

    if (transcriptUrl && ownerId) {
      try {
        const owner = await client.users.fetch(ownerId);
        await owner.send(v2Payload(`## Ticket closed\nYour ticket transcript is ready: ${transcriptUrl}`));
      } catch (error) {
        console.warn('[TRANSCRIPTS] Could not DM transcript link:', error.message);
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

    await channel.send(v2Payload('Transcript saved. This channel will be deleted in 5 seconds.'));
    await interaction.editReply({ content: 'Transcript saved. This ticket will close in 5 seconds.' });
    setTimeout(() => {
      channel.delete('Ticket closed and transcript archived.').catch((error) => {
        console.error('[TRANSCRIPTS] Could not delete ticket channel:', error.message);
      }).finally(() => closingTickets.delete(channel.id));
    }, 5000);
  } catch (error) {
    closingTickets.delete(channel.id);
    console.error('[TRANSCRIPTS] Could not create ticket transcript:', error);
    await interaction.editReply({ content: 'Transcript creation failed. The ticket channel was not deleted.' }).catch(() => {});
  }
}

module.exports = { closeTicket, createTranscript, escapeHtml, getTicketOwnerId };
