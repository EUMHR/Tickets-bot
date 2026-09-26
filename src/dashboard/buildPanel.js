const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder
} = require('discord.js');

function buildPanel(blocks) {
  if (blocks.filter((block) => block.type === 'row').length > 5) {
    throw new Error('A message can contain up to 5 button rows.');
  }
  const components = blocks.map((block) => {
    if (block.type === 'text') {
      if (!block.text?.trim()) throw new Error('Text display blocks cannot be empty.');
      return new TextDisplayBuilder().setContent(block.text);
    }

    if (block.type === 'container') {
      if (!block.text?.trim()) throw new Error('Add text to each container before deploying.');
      const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(block.text));
      if (block.color) container.setAccentColor(Number.parseInt(block.color.slice(1), 16));
      return container;
    }

    if (block.type === 'media') {
      if (!Array.isArray(block.urls) || block.urls.length === 0 || block.urls.length > 10) {
        throw new Error('Media galleries need between 1 and 10 image URLs.');
      }
      const gallery = new MediaGalleryBuilder();
      gallery.addItems(...block.urls.map((url) => {
        if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
          throw new Error('Media gallery URLs must begin with http:// or https://.');
        }
        return new MediaGalleryItemBuilder().setURL(url);
      }));
      return gallery;
    }

    if (block.type === 'separator') return new SeparatorBuilder();

    if (block.type === 'row') {
      if (!block.label?.trim()) throw new Error('Ticket buttons need a label.');
      const button = new ButtonBuilder()
        .setCustomId('create_ticket')
        .setLabel(block.label.slice(0, 80))
        .setStyle(ButtonStyle.Primary);
      if (block.emoji) button.setEmoji(block.emoji);
      return new ActionRowBuilder().addComponents(button);
    }

    throw new Error('The message contains an unsupported component.');
  });

  if (!components.length) throw new Error('Add at least one message component.');
  return { flags: MessageFlags.IsComponentsV2, components };
}

module.exports = { buildPanel };
