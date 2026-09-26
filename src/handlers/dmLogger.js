const fs = require('node:fs');
const path = require('node:path');
const { v2Payload } = require('../dashboard/componentsV2');

const MAX_STORED_LOGS = 5000;

function loadLogs(logPath) {
  if (!fs.existsSync(logPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[DM LOGGER] Could not parse stored DM logs:', error.message);
    return [];
  }
}

function saveLogs(logPath, logs) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, JSON.stringify(logs.slice(-MAX_STORED_LOGS), null, 2));
}

async function logDirectMessage(message, config, logPath) {
  const entry = {
    id: message.id,
    authorId: message.author.id,
    authorTag: message.author.tag,
    content: message.content || '',
    attachments: [...message.attachments.values()].map((attachment) => attachment.url),
    timestamp: new Date().toISOString()
  };
  const logs = loadLogs(logPath);
  logs.push(entry);
  saveLogs(logPath, logs);

  if (config.dmLogChannelId) {
    try {
      const channel = await message.client.channels.fetch(config.dmLogChannelId);
      if (channel?.isTextBased() && channel.send) {
        const text = `## Direct Message\n**Author:** ${entry.authorTag} (${entry.authorId})\n**Time:** ${entry.timestamp}\n\n${entry.content.slice(0, 3500) || '*[no text content]*'}`;
        await channel.send(v2Payload(text));
      }
    } catch (error) {
      console.error('[DM LOGGER] Could not mirror DM:', error.message);
    }
  }
  return entry;
}

module.exports = { logDirectMessage, loadLogs, saveLogs };
