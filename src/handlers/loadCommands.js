const fs = require('node:fs');
const path = require('node:path');
const { Collection } = require('discord.js');

function loadCommands() {
  const commands = new Collection();
  const commandDirectory = path.join(__dirname, '..', 'commands');
  for (const file of fs.readdirSync(commandDirectory).filter((name) => name.endsWith('.js'))) {
    const command = require(path.join(commandDirectory, file));
    commands.set(command.data.name, command);
  }
  return commands;
}

module.exports = { loadCommands };
