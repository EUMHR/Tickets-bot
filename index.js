const { startBot } = require('./src');

startBot().catch((error) => {
  console.error('[BOT] Could not start:', error.message);
  process.exitCode = 1;
});
