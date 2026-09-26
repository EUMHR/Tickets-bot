const fs = require('node:fs');
const path = require('node:path');

const defaults = {
  siteName: 'EUMHR Ticket Studio',
  themeColor: '#c6f36b',
  footerText: 'Made for the community',
  serverLogoUrl: '',
  ticketLogChannelId: '',
  dmLogChannelId: '',
  transcriptSaveDirectory: 'data/transcripts',
  panels: []
};

function loadConfig(configPath = path.join(__dirname, '..', '..', 'config.json')) {
  let loaded = {};
  if (fs.existsSync(configPath)) {
    try {
      loaded = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
      throw new Error(`Could not parse ${configPath}: ${error.message}`);
    }
  }

  const config = { ...defaults, ...loaded };
  if (!Array.isArray(config.panels)) config.panels = [];
  return {
    config,
    configPath,
    save() {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    }
  };
}

const configStore = loadConfig();

module.exports = { configStore, loadConfig };
