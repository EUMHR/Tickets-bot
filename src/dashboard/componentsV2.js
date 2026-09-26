const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder
} = require('discord.js');
const { getSupportRoleIds } = require('../tickets/supportRoles');

const buttonStyles = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger
};

function v2Payload(content, { ephemeral = false, actionRows = [] } = {}) {
  const container = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(String(content ?? ''))
  );
  for (const row of actionRows) container.addActionRowComponents(row);
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0)
  };
}

function v2ContainerPayload(container, { ephemeral = false } = {}) {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0)
  };
}

function buildPanelContainer(panel, config) {
  const container = new ContainerBuilder();
  const accent = Number.parseInt(String(config.themeColor || '#c6f36b').replace('#', ''), 16);
  if (Number.isFinite(accent)) container.setAccentColor(accent);
  const blocks = Array.isArray(panel.components) && panel.components.length
    ? panel.components
    : [
        { type: 'text', content: `## ${panel.panelTitleText}\n${panel.panelDescriptionText || ''}` },
        { type: 'separator', spacing: 'small', divider: true },
        { type: 'actionRow', buttons: [{ buttonType: 'open_ticket', label: panel.buttonLabel || 'Open Ticket', emoji: panel.buttonEmoji || '🎫', style: 'Primary' }] }
      ];
  let buttonIndex = 0;

  for (const block of blocks) {
    if (block.type === 'text') {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(block.content || ' '));
    } else if (block.type === 'separator') {
      const separator = new SeparatorBuilder()
        .setSpacing(block.spacing === 'large' ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small)
        .setDivider(block.divider !== false);
      container.addSeparatorComponents(separator);
    } else if (block.type === 'actionRow') {
      const row = new ActionRowBuilder();
      for (const item of (block.buttons || []).slice(0, 5)) {
        const button = new ButtonBuilder().setLabel(item.label || 'Open Ticket');
        if (item.emoji) button.setEmoji(item.emoji);
        if (item.buttonType === 'link') {
          button.setStyle(ButtonStyle.Link).setURL(item.url || 'https://discord.com');
        } else {
          button
            .setStyle(buttonStyles[item.style] || ButtonStyle.Primary)
            .setCustomId(`open_ticket::${panel.id}::${buttonIndex++}`);
        }
        row.addComponents(button);
      }
      if (row.components.length) container.addActionRowComponents(row);
    }
  }
  return container;
}

function buildTicketWelcome(panel, config, owner) {
  const container = new ContainerBuilder();
  const accent = Number.parseInt(String(config.themeColor || '#c6f36b').replace('#', ''), 16);
  if (Number.isFinite(accent)) container.setAccentColor(accent);
  const supportMentions = getSupportRoleIds(panel).map((roleId) => `<@&${roleId}>`).join(' ');
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `## ${panel.panelTitleText}\nHi <@${owner.id}>, support will be with you shortly. Please describe your issue below.${supportMentions ? `\n\n**Support team:** ${supportMentions}` : ''}`
  ));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim Ticket').setStyle(ButtonStyle.Secondary)
  ));
  return container;
}

module.exports = { buildPanelContainer, buildTicketWelcome, v2Payload, v2ContainerPayload };
