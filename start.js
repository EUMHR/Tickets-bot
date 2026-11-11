const { start } = require('./server');

start().catch((error) => {
  console.error('[STARTUP] Could not start the ticket system:', error.message);
  process.exitCode = 1;
});
