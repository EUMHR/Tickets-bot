const express = require('express');
const path = require('path');
const crypto = require('node:crypto');
const session = require('express-session');
require('dotenv').config();
const { createClient, startBot } = require('./src');
const { configStore } = require('./src/config/configStore');
const { registerAdminPanel } = require('./src/handlers/adminPanel');
const { UserStore } = require('./src/handlers/userStore');
const { buildPanel } = require('./src/dashboard/buildPanel');
const app = express();
const publicDirectory = path.join(__dirname, 'public');
const dashboardPassword = process.env.DASHBOARD_PASSWORD;
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const loginAttempts = new Map();
const config = configStore.config;
const dataDirectory = path.join(__dirname, 'data');
const usersPath = path.join(dataDirectory, 'users.json');
const dmLogPath = path.join(dataDirectory, 'dm-logs.json');
const transcriptDirectory = path.isAbsolute(config.transcriptSaveDirectory)
  ? config.transcriptSaveDirectory
  : path.join(__dirname, config.transcriptSaveDirectory);
const userStore = new UserStore(usersPath);

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false, limit: '5mb' }));
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
app.use(session({
  name: 'ticket-studio.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000
  }
}));

app.get('/login', (req, res) => {
  if (req.session.authenticated) return res.redirect('/admin');
  return res.sendFile(path.join(publicDirectory, 'login.html'));
});

app.get('/login.css', (req, res) => res.sendFile(path.join(publicDirectory, 'login.css')));
app.get('/login.js', (req, res) => res.sendFile(path.join(publicDirectory, 'login.js')));

app.post('/api/login', (req, res, next) => {
  if ((!dashboardPassword || dashboardPassword.length < 12) && userStore.list().length === 0) {
    return res.status(503).json({ error: 'Set a unique DASHBOARD_PASSWORD of at least 12 characters in .env.' });
  }

  const address = req.ip;
  const now = Date.now();
  const attempt = loginAttempts.get(address);
  if (attempt && attempt.expiresAt <= now) loginAttempts.delete(address);
  const currentAttempt = loginAttempts.get(address);
  if (currentAttempt?.count >= 5) {
    return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  }

  const username = String(req.body?.username || '').trim();
  const candidate = typeof req.body?.password === 'string' ? req.body.password : '';
  const candidateHash = crypto.createHash('sha256').update(candidate).digest();
  const passwordHash = crypto.createHash('sha256').update(dashboardPassword || '').digest();
  const masterUsername = process.env.ADMIN_USERNAME || 'admin';
  const isMasterLogin = username.toLowerCase() === masterUsername.toLowerCase()
    && dashboardPassword
    && crypto.timingSafeEqual(candidateHash, passwordHash);
  const isManagedLogin = userStore.verify(username, candidate);
  if (!isMasterLogin && !isManagedLogin) {
    loginAttempts.set(address, {
      count: (currentAttempt?.count || 0) + 1,
      expiresAt: currentAttempt?.expiresAt || now + 15 * 60 * 1000
    });
    return res.status(401).json({ error: 'That password does not match.' });
  }

  loginAttempts.delete(address);
  return req.session.regenerate((error) => {
    if (error) return next(error);
    req.session.authenticated = true;
    req.session.username = isMasterLogin ? masterUsername : userStore.find(username).username;
    return req.session.save((saveError) => {
      if (saveError) return next(saveError);
      return res.json({ success: true });
    });
  });
});

app.use((req, res, next) => {
  if (req.path === '/login.css' || req.path === '/login.js' || req.path === '/site.css') return next();
  if (req.path === '/' || req.path === '/register' || req.path === '/transcripts' || req.path === '/transcripts/' || req.path.startsWith('/transcripts/')) return next();
  if (req.session.authenticated) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Sign in to use the dashboard.' });
  }
  return res.redirect('/login');
});

app.use(express.static(publicDirectory, { index: false }));

app.get('/', (req, res) => res.sendFile(path.join(publicDirectory, 'index.html')));
app.get('/register', (req, res) => res.sendFile(path.join(publicDirectory, 'register.html')));
app.get(['/transcripts', '/transcripts/'], (req, res) => res.sendFile(path.join(publicDirectory, 'index.html')));

app.post('/api/logout', (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('ticket-studio.sid', { httpOnly: true, sameSite: 'strict' });
    return res.json({ success: true });
  });
});

app.post('/api/send-panel', async (req, res) => {
  const { channelId, blocks } = req.body || {};

  if (!/^\d{17,20}$/.test(channelId || '')) {
    return res.status(400).json({ error: 'Enter a valid Discord channel ID.' });
  }
  if (!Array.isArray(blocks) || blocks.length === 0 || blocks.length > 25) {
    return res.status(400).json({ error: 'Add between 1 and 25 message blocks.' });
  }
  if (!client.isReady()) {
    return res.status(503).json({ error: 'The bot is offline. Check DISCORD_TOKEN in your .env file.' });
  }

  try {
    const payload = buildPanel(blocks);
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased() || typeof channel.send !== 'function') {
      return res.status(400).json({ error: 'That channel cannot receive messages.' });
    }

    await channel.send(payload);
    return res.json({ success: true, message: 'Panel deployed successfully.' });
  } catch (error) {
    console.error('[DASHBOARD] Panel deployment failed:', error.message);
    return res.status(400).json({ error: error.message || 'Could not deploy the panel.' });
  }
});

registerAdminPanel({
  app,
  config,
  saveConfig: configStore.save,
  redeployCommands: async () => {
    if (!client.isReady()) throw new Error('The Discord bot is not connected; retry command sync after it reconnects.');
    const { getCommandData } = require('./src');
    await client.application.commands.set(getCommandData(config), process.env.GUILD_ID || undefined);
  },
  transcriptDirectory,
  usersPath,
  userStore,
  dmLogPath
});

app.use((error, req, res, next) => {
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'The request is too large.' });
  }
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: 'Request body must be valid JSON.' });
  }
  return next(error);
});

const client = createClient();
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';

async function start() {
  if (!dashboardPassword || dashboardPassword.length < 12) {
    throw new Error('Set DASHBOARD_PASSWORD in .env to a unique password at least 12 characters long.');
  }
  const server = app.listen(port, host, () => {
    console.log(`[DASHBOARD] Running on http://${host}:${port}`);
  });
  try {
    await startBot(client);
  } catch (error) {
    console.error(`[BOT] Could not connect; dashboard remains available: ${error.message}`);
  }
  return server;
}

if (require.main === module) {
  start().catch((error) => {
    console.error('[STARTUP] Could not start the ticket system:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { app, client, start };
