const fs = require('node:fs');
const path = require('node:path');
const { loadLogs, saveLogs } = require('./dmLogger');
const { UserStore } = require('./userStore');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function inlineJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function slugify(value) {
  return String(value || '').toLowerCase().trim().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
}

function parseComponents(raw) {
  if (!raw || !String(raw).trim()) return { components: null, error: null };
  let blocks;
  try { blocks = JSON.parse(raw); } catch { return { error: 'Components layout is invalid JSON.' }; }
  if (!Array.isArray(blocks) || blocks.length > 10) return { error: 'A layout must contain at most 10 component blocks.' };
  let hasTicketButton = false;
  const clean = [];

  for (const block of blocks) {
    if (!block || typeof block !== 'object') return { error: 'Invalid component block.' };
    if (block.type === 'text') {
      const content = String(block.content || '').trim();
      if (!content) return { error: 'Text blocks cannot be empty.' };
      clean.push({ type: 'text', content: content.slice(0, 3900) });
    } else if (block.type === 'separator') {
      clean.push({ type: 'separator', spacing: block.spacing === 'large' ? 'large' : 'small', divider: block.divider !== false });
    } else if (block.type === 'actionRow') {
      if (!Array.isArray(block.buttons) || block.buttons.length < 1 || block.buttons.length > 5) {
        return { error: 'Each button row must contain 1-5 buttons.' };
      }
      const buttons = [];
      for (const button of block.buttons) {
        const label = String(button?.label || '').trim();
        if (!label) return { error: 'Every button needs a label.' };
        if (button.buttonType === 'link') {
          const url = String(button.url || '').trim();
          try {
            const parsed = new URL(url);
            if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
          } catch {
            return { error: `Link button "${escapeHtml(label)}" needs a valid HTTP(S) URL.` };
          }
          buttons.push({ buttonType: 'link', label: label.slice(0, 80), emoji: String(button.emoji || '').slice(0, 32), url });
        } else {
          hasTicketButton = true;
          buttons.push({
            buttonType: 'open_ticket',
            label: label.slice(0, 80),
            emoji: String(button.emoji || '').slice(0, 32),
            style: ['Primary', 'Secondary', 'Success', 'Danger'].includes(button.style) ? button.style : 'Primary'
          });
        }
      }
      clean.push({ type: 'actionRow', buttons });
    } else {
      return { error: 'Unsupported component type.' };
    }
  }
  if (clean.length && !hasTicketButton) return { error: 'Add at least one Open Ticket button to the panel.' };
  return { components: clean.length ? clean : null, error: null };
}

function parseSupportRoleIds(raw) {
  const roleIds = [...new Set(String(raw || '').split(/[\s,]+/).filter(Boolean))];
  if (!roleIds.length) return { roleIds: null, error: 'Add at least one support role ID.' };
  if (roleIds.length > 20) return { roleIds: null, error: 'A panel can have at most 20 support roles.' };
  if (roleIds.some((roleId) => !/^\d{17,20}$/.test(roleId))) {
    return { roleIds: null, error: 'Support role IDs must be valid Discord IDs, separated by commas or new lines.' };
  }
  return { roleIds, error: null };
}

function adminChrome(config, active, content) {
  const navItems = [
    ['Panels', '/admin', 'panels'],
    ['Transcripts', '/admin/transcripts', 'transcripts'],
    ['DM Logs', '/admin/dm-logs', 'dm-logs'],
    ['Users', '/admin/users', 'users'],
    ['Settings', '/admin/settings', 'settings']
  ];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#151714"><title>${escapeHtml(config.siteName)} / Admin</title><link rel="stylesheet" href="/admin.css"></head><body style="--accent:${escapeHtml(config.themeColor)}"><header class="admin-topbar"><a class="admin-brand" href="/admin"><span class="brand-mark">M</span><span>${escapeHtml(config.siteName)} <i>/</i> CONTROL</span></a><nav class="admin-nav">${navItems.map(([label, href, id]) => `<a href="${href}"${active === id ? ' aria-current="page"' : ''}>${label}</a>`).join('')}<a href="/admin/logout">Lock</a></nav></header><main class="admin-main">${content}</main><footer class="admin-footer">MHR / EUMHR <span>DISCORD SYSTEMS</span></footer></body></html>`;
}

function flashHtml(req) {
  const message = req.query.success || req.query.error;
  if (!message) return '';
  return `<div class="admin-flash ${req.query.error ? 'is-error' : 'is-success'}">${escapeHtml(message)}</div>`;
}

function panelEditor(panel, isNew, config, req) {
  const components = inlineJson(panel.components || []);
  const formAction = isNew ? '/admin/panels/new' : `/admin/panels/${encodeURIComponent(panel.id)}/edit`;
  return `${flashHtml(req)}<a class="back-link" href="/admin">&#8592; All panels</a><form id="panelForm" class="panel-editor" method="post" action="${formAction}"><div class="editor-columns"><section class="admin-section"><div class="section-kicker">PANEL DETAILS</div><h1>${isNew ? 'New ticket panel' : `Edit ${escapeHtml(panel.panelTitleText)}`}</h1><label>Panel title<input name="panelTitleText" value="${escapeHtml(panel.panelTitleText)}" maxlength="100" required></label><label>Description<textarea name="panelDescriptionText" rows="3" maxlength="1000">${escapeHtml(panel.panelDescriptionText)}</textarea></label><div class="form-grid"><label>Button label<input name="buttonLabel" value="${escapeHtml(panel.buttonLabel)}" maxlength="80" required></label><label>Button emoji<input name="buttonEmoji" value="${escapeHtml(panel.buttonEmoji)}" maxlength="32" placeholder="🎫"></label></div><label>Slash command<input name="commandName" value="${escapeHtml(panel.commandName)}" pattern="[a-z0-9_-]{1,32}" placeholder="setup-support" required></label><label>Command description<input name="commandDescription" value="${escapeHtml(panel.commandDescription)}" maxlength="100" required></label><div class="form-grid"><label>Ticket category ID<input name="categoryChannelId" value="${escapeHtml(panel.categoryChannelId)}" inputmode="numeric" pattern="[0-9]{17,20}" required></label><label>Support role ID<input name="supportRoleId" value="${escapeHtml(panel.supportRoleId)}" inputmode="numeric" pattern="[0-9]{17,20}" required></label></div><div class="form-actions"><button class="admin-button" type="submit">${isNew ? 'Create panel' : 'Save panel'}</button><a class="admin-button secondary" href="/admin">Cancel</a></div></section><section class="admin-section component-editor"><div class="section-kicker">COMPONENTS V2</div><h2>Message layout</h2><p class="section-hint">Add text, separators, or button rows. Layouts need at least one ticket button.</p><div class="builder-toolbar"><button type="button" data-add-block="text">+ Text</button><button type="button" data-add-block="separator">+ Separator</button><button type="button" data-add-block="actionRow">+ Button row</button></div><div id="builderBlocks"></div><input id="componentsJson" type="hidden" name="componentsJson"><div class="discord-preview"><div class="discord-author"><span class="preview-avatar">M</span><span>${escapeHtml(config.siteName)}</span><small>APP</small><time>Today at 9:41 PM</time></div><div id="previewBody" class="preview-body"></div></div></section></div></form><script>window.panelEditorData=${components};window.panelTheme=${inlineJson(config.themeColor)};</script><script src="/admin-builder.js" defer></script>`;
}

function getTranscripts(directory) {
  if (!fs.existsSync(directory)) return [];
  const rows = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && /^[0-9]{17,20}$/.test(entry.name)) {
      for (const file of fs.readdirSync(path.join(directory, entry.name))) {
        if (!/^[a-z0-9]{6,40}\.html$/i.test(file)) continue;
        const filePath = path.join(directory, entry.name, file);
        const stat = fs.statSync(filePath);
        rows.push({ guildId: entry.name, ticketId: file.slice(0, -5), size: stat.size, mtime: stat.mtime });
      }
    }
  }
  return rows.sort((a, b) => b.mtime - a.mtime);
}

function transcriptPath(directory, guildId, ticketId) {
  if (!/^[0-9]{17,20}$/.test(guildId) || !/^[a-z0-9]{6,40}$/i.test(ticketId)) return null;
  return path.join(directory, guildId, `${ticketId}.html`);
}

function formatBytes(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function registerAdminPanel({ app, config, saveConfig, redeployCommands, transcriptDirectory, usersPath, userStore: providedUserStore, dmLogPath }) {
  const userStore = providedUserStore || new UserStore(usersPath);
  const requireAdmin = (req, res, next) => req.session?.authenticated ? next() : res.redirect('/login');
  async function syncCommandsOrWarning() {
    try {
      await redeployCommands();
      return null;
    } catch (error) {
      console.error(`[ADMIN] Slash-command redeploy failed (Discord ${error.code || 'unknown'}): ${error.message}`);
      return `Panel data was saved, but Discord command sync failed (${error.code || 'unknown'}): ${error.message}`;
    }
  }

  app.get('/admin', requireAdmin, (req, res) => {
    const rows = config.panels.map((panel) => `<tr><td>${escapeHtml(panel.panelTitleText)}${panel.components ? '<span class="layout-tag">CUSTOM LAYOUT</span>' : ''}</td><td>/${escapeHtml(panel.commandName)}</td><td>${escapeHtml(panel.buttonEmoji)} ${escapeHtml(panel.buttonLabel)}</td><td class="table-actions"><a class="admin-button small secondary" href="/admin/panels/${encodeURIComponent(panel.id)}/edit">Edit</a><form method="post" action="/admin/panels/${encodeURIComponent(panel.id)}/delete" onsubmit="return confirm('Delete this panel?')"><button class="admin-button small danger">Delete</button></form></td></tr>`).join('');
    const body = `${flashHtml(req)}<div class="admin-heading"><div><div class="section-kicker">TICKETING</div><h1>Panels</h1><p>Build ticket entry points and manage their live Components V2 layouts.</p></div><a class="admin-button" href="/admin/panels/new">+ New panel</a></div><section class="admin-section table-section"><div class="table-heading"><h2>Configured panels</h2><span>${config.panels.length} TOTAL</span></div><div class="table-scroll"><table><thead><tr><th>Panel</th><th>Slash command</th><th>Button</th><th>Actions</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="empty-row">No panels yet. Create one to get started.</td></tr>'}</tbody></table></div></section>`;
    res.send(adminChrome(config, 'panels', body));
  });

  app.get('/admin/panels/new', requireAdmin, (req, res) => {
    const blank = { id: '', commandName: '', commandDescription: '', categoryChannelId: '', supportRoleId: '', panelTitleText: '', panelDescriptionText: '', buttonLabel: 'Open Ticket', buttonEmoji: '🎫', components: null };
    res.send(adminChrome(config, 'panels', panelEditor(blank, true, config, req)));
  });

  app.post('/admin/panels/new', requireAdmin, async (req, res) => {
    const body = req.body || {};
    const commandName = slugify(body.commandName);
    const roleResult = parseSupportRoleIds(body.supportRoleId);
    const reserved = new Set(['ticket-panel', 'close-ticket']);
    if (!body.panelTitleText?.trim() || !/^[a-z0-9_-]{1,32}$/.test(commandName) || reserved.has(commandName)
      || !/^\d{17,20}$/.test(String(body.categoryChannelId || '').trim())
      || roleResult.error) {
      return res.redirect(`/admin/panels/new?error=${encodeURIComponent(roleResult.error || 'Add a title, valid category ID, and unique slash command name.')}`);
    }
    if (config.panels.some((panel) => panel.commandName === commandName)) {
      return res.redirect(`/admin/panels/new?error=${encodeURIComponent('That slash command is already used by another panel.')}`);
    }
    const parsed = parseComponents(body.componentsJson);
    if (parsed.error) return res.redirect(`/admin/panels/new?error=${encodeURIComponent(parsed.error)}`);
    const panel = {
      id: `${slugify(body.panelTitleText)}-${Date.now().toString(36)}`,
      commandName,
      commandDescription: String(body.commandDescription || `Deploy ${body.panelTitleText} ticket panel`).slice(0, 100),
      categoryChannelId: String(body.categoryChannelId || '').trim(),
      supportRoleId: roleResult.roleIds.join(','),
      panelTitleText: String(body.panelTitleText).trim().slice(0, 100),
      panelDescriptionText: String(body.panelDescriptionText || '').trim().slice(0, 1000),
      buttonLabel: String(body.buttonLabel || 'Open Ticket').trim().slice(0, 80),
      buttonEmoji: String(body.buttonEmoji || '🎫').trim().slice(0, 32)
    };
    if (parsed.components) panel.components = parsed.components;
    config.panels.push(panel);
    saveConfig();
    const syncWarning = await syncCommandsOrWarning();
    const query = syncWarning
      ? `error=${encodeURIComponent(syncWarning)}`
      : `success=${encodeURIComponent(`Created panel ${panel.panelTitleText}.`)}`;
    res.redirect(`/admin?${query}`);
  });

  app.get('/admin/panels/:id/edit', requireAdmin, (req, res) => {
    const panel = config.panels.find((item) => item.id === req.params.id);
    if (!panel) return res.redirect(`/admin?error=${encodeURIComponent('Panel not found.')}`);
    res.send(adminChrome(config, 'panels', panelEditor(panel, false, config, req)));
  });

  app.post('/admin/panels/:id/edit', requireAdmin, async (req, res) => {
    const panel = config.panels.find((item) => item.id === req.params.id);
    if (!panel) return res.redirect(`/admin?error=${encodeURIComponent('Panel not found.')}`);
    const body = req.body || {};
    const commandName = slugify(body.commandName || panel.commandName);
    const roleResult = parseSupportRoleIds(body.supportRoleId);
    if (!/^[a-z0-9_-]{1,32}$/.test(commandName) || ['ticket-panel', 'close-ticket'].includes(commandName) || config.panels.some((item) => item.id !== panel.id && item.commandName === commandName)
      || !/^\d{17,20}$/.test(String(body.categoryChannelId || '').trim())
      || roleResult.error) {
      return res.redirect(`/admin/panels/${encodeURIComponent(panel.id)}/edit?error=${encodeURIComponent(roleResult.error || 'Choose valid channel IDs and a unique slash command name.')}`);
    }
    const parsed = parseComponents(body.componentsJson);
    if (parsed.error) return res.redirect(`/admin/panels/${encodeURIComponent(panel.id)}/edit?error=${encodeURIComponent(parsed.error)}`);
    Object.assign(panel, {
      commandName,
      commandDescription: String(body.commandDescription || panel.commandDescription).slice(0, 100),
      categoryChannelId: String(body.categoryChannelId || '').trim(),
      supportRoleId: roleResult.roleIds.join(','),
      panelTitleText: String(body.panelTitleText || panel.panelTitleText).trim().slice(0, 100),
      panelDescriptionText: String(body.panelDescriptionText || '').trim().slice(0, 1000),
      buttonLabel: String(body.buttonLabel || 'Open Ticket').trim().slice(0, 80),
      buttonEmoji: String(body.buttonEmoji || '🎫').trim().slice(0, 32)
    });
    if (parsed.components) panel.components = parsed.components;
    else delete panel.components;
    saveConfig();
    const syncWarning = await syncCommandsOrWarning();
    const query = syncWarning
      ? `error=${encodeURIComponent(syncWarning)}`
      : `success=${encodeURIComponent(`Updated panel ${panel.panelTitleText}.`)}`;
    res.redirect(`/admin?${query}`);
  });

  app.post('/admin/panels/:id/delete', requireAdmin, async (req, res) => {
    const index = config.panels.findIndex((panel) => panel.id === req.params.id);
    if (index < 0) return res.redirect(`/admin?error=${encodeURIComponent('Panel not found.')}`);
    const [removed] = config.panels.splice(index, 1);
    saveConfig();
    const syncWarning = await syncCommandsOrWarning();
    const query = syncWarning
      ? `error=${encodeURIComponent(syncWarning)}`
      : `success=${encodeURIComponent(`Deleted panel ${removed.panelTitleText}.`)}`;
    res.redirect(`/admin?${query}`);
  });

  app.get('/admin/users', requireAdmin, (req, res) => {
    const rows = userStore.list().map((user) => `<tr><td>${escapeHtml(user.username)}${user.username === req.session.username ? '<span class="layout-tag">YOU</span>' : ''}</td><td>${escapeHtml(new Date(user.createdAt).toLocaleDateString())}</td><td><form method="post" action="/admin/users/${encodeURIComponent(user.username)}/delete" onsubmit="return confirm('Remove this dashboard user?')"><button class="admin-button small danger">Remove</button></form></td></tr>`).join('');
    const body = `${flashHtml(req)}<div class="admin-heading"><div><div class="section-kicker">ACCESS CONTROL</div><h1>Dashboard users</h1><p>Additional accounts use unique scrypt-hashed passwords.</p></div></div><section class="admin-section table-section"><div class="table-heading"><h2>Accounts</h2></div><div class="table-scroll"><table><thead><tr><th>Username</th><th>Added</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="empty-row">No additional accounts have been added.</td></tr>'}</tbody></table></div></section><section class="admin-section"><h2>Add dashboard user</h2><form method="post" action="/admin/users/new" class="admin-form compact-form"><label>Username<input name="username" required minlength="2" maxlength="32" pattern="[A-Za-z0-9_.-]+"></label><label>Password<input name="password" type="password" required minlength="12" autocomplete="new-password"></label><button class="admin-button">Add user</button></form></section>`;
    res.send(adminChrome(config, 'users', body));
  });

  app.post('/admin/users/new', requireAdmin, (req, res) => {
    try {
      userStore.add(req.body.username, req.body.password);
      res.redirect(`/admin/users?success=${encodeURIComponent('Dashboard user added.')}`);
    } catch (error) {
      res.redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
    }
  });

  app.post('/admin/users/:username/delete', requireAdmin, (req, res) => {
    try {
      userStore.remove(req.params.username);
      res.redirect(`/admin/users?success=${encodeURIComponent('Dashboard user removed.')}`);
    } catch (error) {
      res.redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
    }
  });

  app.get('/admin/transcripts', requireAdmin, (req, res) => {
    const rows = getTranscripts(transcriptDirectory).map((item) => `<tr><td>${escapeHtml(item.guildId)}</td><td>${escapeHtml(item.ticketId)}</td><td>${formatBytes(item.size)}</td><td>${escapeHtml(item.mtime.toLocaleString())}</td><td class="table-actions"><a class="admin-button small secondary" href="/transcripts/${item.guildId}/${item.ticketId}" target="_blank" rel="noopener">View</a><a class="admin-button small secondary" href="/admin/transcripts/${item.guildId}/${item.ticketId}/edit">Edit</a><form method="post" action="/admin/transcripts/${item.guildId}/${item.ticketId}/delete" onsubmit="return confirm('Delete this transcript permanently?')"><button class="admin-button small danger">Delete</button></form></td></tr>`).join('');
    const body = `${flashHtml(req)}<div class="admin-heading"><div><div class="section-kicker">ARCHIVE</div><h1>Transcripts</h1><p>Browse, edit, and remove saved ticket history.</p></div></div><section class="admin-section table-section"><div class="table-heading"><h2>Saved transcripts</h2><span>${getTranscripts(transcriptDirectory).length} TOTAL</span></div><div class="table-scroll"><table><thead><tr><th>Server</th><th>Ticket</th><th>Size</th><th>Saved</th><th>Actions</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="empty-row">No transcripts saved yet.</td></tr>'}</tbody></table></div></section>`;
    res.send(adminChrome(config, 'transcripts', body));
  });

  app.get('/admin/transcripts/:guildId/:ticketId/edit', requireAdmin, (req, res) => {
    const filePath = transcriptPath(transcriptDirectory, req.params.guildId, req.params.ticketId);
    if (!filePath || !fs.existsSync(filePath)) return res.redirect(`/admin/transcripts?error=${encodeURIComponent('Transcript not found.')}`);
    const html = fs.readFileSync(filePath, 'utf8');
    const body = `<a class="back-link" href="/admin/transcripts">&#8592; Transcript list</a><section class="admin-section"><div class="section-kicker">RAW HTML</div><h1>Edit transcript</h1><p class="section-hint">Transcript HTML is rendered in a sandboxed public page.</p><form method="post" action="/admin/transcripts/${req.params.guildId}/${req.params.ticketId}/edit"><textarea name="html" class="source-editor" required>${escapeHtml(html)}</textarea><div class="form-actions"><button class="admin-button">Save transcript</button><a class="admin-button secondary" href="/transcripts/${req.params.guildId}/${req.params.ticketId}" target="_blank" rel="noopener">Preview</a></div></form></section>`;
    res.send(adminChrome(config, 'transcripts', body));
  });

  app.post('/admin/transcripts/:guildId/:ticketId/edit', requireAdmin, (req, res) => {
    const filePath = transcriptPath(transcriptDirectory, req.params.guildId, req.params.ticketId);
    if (!filePath || !fs.existsSync(filePath)) return res.redirect(`/admin/transcripts?error=${encodeURIComponent('Transcript not found.')}`);
    fs.writeFileSync(filePath, String(req.body.html || ''));
    res.redirect(`/admin/transcripts?success=${encodeURIComponent('Transcript updated.')}`);
  });

  app.post('/admin/transcripts/:guildId/:ticketId/delete', requireAdmin, (req, res) => {
    const filePath = transcriptPath(transcriptDirectory, req.params.guildId, req.params.ticketId);
    if (!filePath || !fs.existsSync(filePath)) return res.redirect(`/admin/transcripts?error=${encodeURIComponent('Transcript not found.')}`);
    fs.unlinkSync(filePath);
    res.redirect(`/admin/transcripts?success=${encodeURIComponent('Transcript deleted.')}`);
  });

  app.get('/admin/dm-logs', requireAdmin, (req, res) => {
    const logs = loadLogs(dmLogPath).slice().reverse().slice(0, 200);
    const rows = logs.map((entry) => `<tr><td>${escapeHtml(entry.authorTag)}<br><span class="table-muted">${escapeHtml(entry.authorId)}</span></td><td class="message-cell">${escapeHtml(entry.content || '(no text content)')}${entry.attachments?.length ? `<br><span class="layout-tag">${entry.attachments.length} ATTACHMENT(S)</span>` : ''}</td><td>${escapeHtml(new Date(entry.timestamp).toLocaleString())}</td><td><form method="post" action="/admin/dm-logs/${encodeURIComponent(entry.id)}/delete"><button class="admin-button small danger">Delete</button></form></td></tr>`).join('');
    const body = `${flashHtml(req)}<div class="admin-heading"><div><div class="section-kicker">INBOX</div><h1>Direct messages</h1><p>Recent DMs received by the bot. Stored logs are capped at 5,000 messages.</p></div><form method="post" action="/admin/dm-logs/clear" onsubmit="return confirm('Clear all saved direct messages?')"><button class="admin-button danger">Clear logs</button></form></div><section class="admin-section table-section"><div class="table-heading"><h2>Recent messages</h2><span>${logs.length} SHOWN</span></div><div class="table-scroll"><table><thead><tr><th>Author</th><th>Message</th><th>Received</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="empty-row">No direct messages logged.</td></tr>'}</tbody></table></div></section>`;
    res.send(adminChrome(config, 'dm-logs', body));
  });

  app.post('/admin/dm-logs/:id/delete', requireAdmin, (req, res) => {
    const logs = loadLogs(dmLogPath).filter((entry) => entry.id !== req.params.id);
    saveLogs(dmLogPath, logs);
    res.redirect(`/admin/dm-logs?success=${encodeURIComponent('DM log removed.')}`);
  });

  app.post('/admin/dm-logs/clear', requireAdmin, (req, res) => {
    saveLogs(dmLogPath, []);
    res.redirect(`/admin/dm-logs?success=${encodeURIComponent('DM logs cleared.')}`);
  });

  app.get('/admin/settings', requireAdmin, (req, res) => {
    const body = `${flashHtml(req)}<div class="admin-heading"><div><div class="section-kicker">CONFIGURATION</div><h1>Site settings</h1><p>Branding, transcript delivery, and Discord log channels.</p></div></div><section class="admin-section"><form method="post" action="/admin/settings" class="admin-form"><label>Site name<input name="siteName" value="${escapeHtml(config.siteName)}" required maxlength="80"></label><label>Accent color<input name="themeColor" type="color" value="${/^#[0-9a-f]{6}$/i.test(config.themeColor) ? config.themeColor : '#c6f36b'}"></label><label>Footer text<input name="footerText" value="${escapeHtml(config.footerText)}" maxlength="160"></label><label>Bot logo URL<input name="serverLogoUrl" type="url" value="${escapeHtml(config.serverLogoUrl)}"></label><label>Ticket log channel ID<input name="ticketLogChannelId" value="${escapeHtml(config.ticketLogChannelId)}" inputmode="numeric"></label><label>DM log channel ID<input name="dmLogChannelId" value="${escapeHtml(config.dmLogChannelId)}" inputmode="numeric"></label><label>Public dashboard URL<input name="domainUrl" type="url" value="${escapeHtml(config.domainUrl || process.env.DOMAIN_URL || '')}" placeholder="https://tickets.example.com"></label><p class="section-hint">Configure a public HTTPS URL before enabling ticket transcript delivery.</p><button class="admin-button">Save settings</button></form></section>`;
    res.send(adminChrome(config, 'settings', body));
  });

  app.post('/admin/settings', requireAdmin, (req, res) => {
    const body = req.body || {};
    config.siteName = String(body.siteName || config.siteName).trim().slice(0, 80);
    config.themeColor = /^#[0-9a-f]{6}$/i.test(body.themeColor || '') ? body.themeColor : config.themeColor;
    config.footerText = String(body.footerText || '').trim().slice(0, 160);
    config.serverLogoUrl = String(body.serverLogoUrl || '').trim().slice(0, 1000);
    config.ticketLogChannelId = String(body.ticketLogChannelId || '').trim();
    config.dmLogChannelId = String(body.dmLogChannelId || '').trim();
    config.domainUrl = String(body.domainUrl || '').trim().replace(/\/$/, '');
    saveConfig();
    res.redirect(`/admin/settings?success=${encodeURIComponent('Settings saved.')}`);
  });

  app.get('/admin/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

  app.get('/transcripts/:guildId/:ticketId', (req, res) => {
    const filePath = transcriptPath(transcriptDirectory, req.params.guildId, req.params.ticketId);
    if (!filePath || !fs.existsSync(filePath)) return res.status(404).send('Transcript not found.');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "sandbox allow-same-origin; default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:; frame-ancestors 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(filePath);
  });
}

module.exports = { registerAdminPanel, parseComponents, parseSupportRoleIds };
