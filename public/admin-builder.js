const blocks = Array.isArray(window.panelEditorData) ? window.panelEditorData : [];
const blockRoot = document.getElementById('builderBlocks');
const previewRoot = document.getElementById('previewBody');
const panelForm = document.getElementById('panelForm');
const componentInput = document.getElementById('componentsJson');
const supportRoleInput = panelForm.querySelector('[name="supportRoleId"]');
if (supportRoleInput) {
  supportRoleInput.removeAttribute('pattern');
  supportRoleInput.placeholder = 'Role ID 1, Role ID 2';
  supportRoleInput.closest('label').childNodes[0].nodeValue = 'Staff role IDs (comma-separated)';
}

function fieldInput(value, placeholder, onInput, type = 'text') {
  const input = document.createElement('input');
  input.type = type;
  input.value = value || '';
  input.placeholder = placeholder;
  input.addEventListener('input', () => { onInput(input.value); renderPreview(); });
  return input;
}

function blockCard(title, index) {
  const card = document.createElement('section');
  card.className = 'component-block';
  const head = document.createElement('div');
  head.className = 'component-head';
  const label = document.createElement('strong');
  label.textContent = `${String(index + 1).padStart(2, '0')} / ${title}`;
  const tools = document.createElement('div');
  tools.className = 'component-tools';
  for (const [text, action, disabled] of [
    ['↑', () => moveBlock(index, -1), index === 0],
    ['↓', () => moveBlock(index, 1), index === blocks.length - 1],
    ['×', () => { blocks.splice(index, 1); render(); }, false]
  ]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.disabled = disabled;
    button.addEventListener('click', action);
    tools.append(button);
  }
  head.append(label, tools);
  card.append(head);
  return card;
}

function moveBlock(index, offset) {
  const target = index + offset;
  if (target < 0 || target >= blocks.length) return;
  [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
  render();
}

function render() {
  blockRoot.replaceChildren();
  blocks.forEach((block, index) => {
    if (block.type === 'text') {
      const card = blockCard('Text display', index);
      const area = document.createElement('textarea');
      area.value = block.content || '';
      area.placeholder = '## Heading\nMessage text (Discord markdown supported)';
      area.addEventListener('input', () => { block.content = area.value; renderPreview(); });
      card.append(area);
      blockRoot.append(card);
    } else if (block.type === 'separator') {
      const card = blockCard('Separator', index);
      const spacing = document.createElement('select');
      for (const [value, text] of [['small', 'Small spacing'], ['large', 'Large spacing']]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        option.selected = (block.spacing || 'small') === value;
        spacing.append(option);
      }
      spacing.addEventListener('change', () => { block.spacing = spacing.value; renderPreview(); });
      const lineLabel = document.createElement('label');
      lineLabel.className = 'check-line';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = block.divider !== false;
      checkbox.addEventListener('change', () => { block.divider = checkbox.checked; renderPreview(); });
      lineLabel.append(checkbox, document.createTextNode('Show divider line'));
      card.append(spacing, lineLabel);
      blockRoot.append(card);
    } else if (block.type === 'actionRow') {
      const card = blockCard('Button row', index);
      block.buttons = Array.isArray(block.buttons) ? block.buttons : [];
      block.buttons.forEach((button, buttonIndex) => renderButton(card, block, button, buttonIndex));
      if (block.buttons.length < 5) {
        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.className = 'admin-button secondary small';
        addButton.textContent = '+ Add button';
        addButton.addEventListener('click', () => {
          block.buttons.push({ buttonType: 'open_ticket', label: 'Open Ticket', emoji: '🎫', style: 'Primary' });
          render();
        });
        card.append(addButton);
      }
      blockRoot.append(card);
    }
  });
  if (!blocks.length) {
    const empty = document.createElement('p');
    empty.className = 'section-hint';
    empty.textContent = 'Quick settings will be used. Add a block to customize the message.';
    blockRoot.append(empty);
  }
  renderPreview();
}

function renderButton(parent, row, button, index) {
  const card = document.createElement('div');
  card.className = 'component-button';
  const type = document.createElement('select');
  for (const [value, text] of [['open_ticket', 'Open Ticket'], ['link', 'Link button']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    option.selected = (button.buttonType || 'open_ticket') === value;
    type.append(option);
  }
  type.addEventListener('change', () => { button.buttonType = type.value; render(); });
  const label = fieldInput(button.label, 'Button label', (value) => { button.label = value; });
  const emoji = fieldInput(button.emoji, 'Emoji (optional)', (value) => { button.emoji = value; });
  card.append(type, label, emoji);
  if (button.buttonType === 'link') {
    card.append(fieldInput(button.url, 'https://example.com', (value) => { button.url = value; }, 'url'));
  } else {
    const style = document.createElement('select');
    for (const value of ['Primary', 'Secondary', 'Success', 'Danger']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = `${value} style`;
      option.selected = (button.style || 'Primary') === value;
      style.append(option);
    }
    style.addEventListener('change', () => { button.style = style.value; renderPreview(); });
    card.append(style);
  }
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'admin-button danger small';
  remove.textContent = 'Remove button';
  remove.addEventListener('click', () => { row.buttons.splice(index, 1); render(); });
  card.append(remove);
  parent.append(card);
}

function renderPreview() {
  previewRoot.replaceChildren();
  const previewContainer = document.createElement('div');
  previewContainer.className = 'preview-container';
  previewContainer.style.borderLeftColor = window.panelTheme || '#c6f36b';
  const activeBlocks = blocks.length ? blocks : [
    { type: 'text', content: `## ${document.querySelector('[name="panelTitleText"]').value}\n${document.querySelector('[name="panelDescriptionText"]').value}` },
    { type: 'separator' },
    { type: 'actionRow', buttons: [{ buttonType: 'open_ticket', label: document.querySelector('[name="buttonLabel"]').value || 'Open Ticket', emoji: document.querySelector('[name="buttonEmoji"]').value }] }
  ];

  activeBlocks.forEach((block) => {
    if (block.type === 'text') {
      const text = document.createElement('div');
      text.className = 'preview-text';
      text.textContent = block.content || 'Text display';
      previewContainer.append(text);
    } else if (block.type === 'separator') {
      if (block.divider !== false) {
        const separator = document.createElement('hr');
        separator.className = 'preview-separator';
        previewContainer.append(separator);
      } else {
        const spacer = document.createElement('div');
        spacer.className = block.spacing === 'large' ? 'preview-spacer-large' : 'preview-spacer-small';
        previewContainer.append(spacer);
      }
    } else if (block.type === 'actionRow') {
      const row = document.createElement('div');
      row.className = 'preview-button-row';
      (block.buttons || []).forEach((button) => {
        const previewButton = document.createElement('span');
        previewButton.className = `preview-button ${(button.style || 'Primary').toLowerCase()}`;
        previewButton.textContent = `${button.emoji ? `${button.emoji} ` : ''}${button.label || 'Button'}`;
        row.append(previewButton);
      });
      previewContainer.append(row);
    }
  });
  previewRoot.append(previewContainer);
}

document.querySelectorAll('[data-add-block]').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.addBlock === 'text') blocks.push({ type: 'text', content: '' });
    else if (button.dataset.addBlock === 'separator') blocks.push({ type: 'separator', spacing: 'small', divider: true });
    else blocks.push({ type: 'actionRow', buttons: [{ buttonType: 'open_ticket', label: 'Open Ticket', emoji: '🎫', style: 'Primary' }] });
    render();
  });
});

for (const name of ['panelTitleText', 'panelDescriptionText', 'buttonLabel', 'buttonEmoji']) {
  document.querySelector(`[name="${name}"]`)?.addEventListener('input', renderPreview);
}
panelForm.addEventListener('submit', () => { componentInput.value = JSON.stringify(blocks); });
render();
