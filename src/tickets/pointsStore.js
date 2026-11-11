const fs = require('node:fs');
const path = require('node:path');

const defaultPath = path.join(__dirname, '..', '..', 'data', 'staff-points.json');

function readPoints(filePath = defaultPath) {
  if (!fs.existsSync(filePath)) return { balances: {}, reviews: {} };
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!parsed || typeof parsed !== 'object'
    || !parsed.balances || typeof parsed.balances !== 'object'
    || !parsed.reviews || typeof parsed.reviews !== 'object') {
    throw new Error(`Invalid points data in ${filePath}.`);
  }
  return parsed;
}

function writePoints(data, filePath = defaultPath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(data, null, 2));
  fs.renameSync(temporaryPath, filePath);
}

function getReview(channelId, filePath = defaultPath) {
  return readPoints(filePath).reviews[channelId] || null;
}

function createPendingReview(review, filePath = defaultPath) {
  const data = readPoints(filePath);
  if (data.reviews[review.channelId]) {
    throw new Error(`A points review already exists for ticket ${review.channelId}.`);
  }
  data.reviews[review.channelId] = { ...review, status: 'pending', logged: false };
  writePoints(data, filePath);
}

function resolveReview(channelId, approved, reviewerId, filePath = defaultPath) {
  const data = readPoints(filePath);
  const review = data.reviews[channelId];
  if (!review) throw new Error(`No points review exists for ticket ${channelId}.`);
  if (review.status !== 'pending') return review;

  review.status = approved ? 'approved' : 'rejected';
  review.reviewerId = reviewerId;
  review.reviewedAt = new Date().toISOString();
  if (approved && review.staffId) {
    const guildBalances = data.balances[review.guildId] || (data.balances[review.guildId] = {});
    guildBalances[review.staffId] = (guildBalances[review.staffId] || 0) + 2;
  }
  writePoints(data, filePath);
  return review;
}

function markReviewLogged(channelId, filePath = defaultPath) {
  const data = readPoints(filePath);
  const review = data.reviews[channelId];
  if (!review) throw new Error(`No points review exists for ticket ${channelId}.`);
  review.logged = true;
  writePoints(data, filePath);
}

function getPoints(guildId, userId, filePath = defaultPath) {
  const data = readPoints(filePath);
  return data.balances[guildId]?.[userId] || 0;
}

function adjustPoints(guildId, userId, action, amount, filePath = defaultPath) {
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new Error('Point amount must be a positive whole number.');
  }
  if (!['add', 'remove'].includes(action)) {
    throw new Error('Point action must be add or remove.');
  }

  const data = readPoints(filePath);
  const guildBalances = data.balances[guildId] || (data.balances[guildId] = {});
  const previous = guildBalances[userId] || 0;
  if (action === 'remove' && previous < amount) {
    throw new Error(`Cannot remove ${amount} points; this member only has ${previous}.`);
  }
  const balance = action === 'add' ? previous + amount : previous - amount;
  if (!Number.isSafeInteger(balance)) throw new Error('The resulting point balance is too large.');
  guildBalances[userId] = balance;
  writePoints(data, filePath);
  return balance;
}

function resetPoints(guildId, filePath = defaultPath) {
  const data = readPoints(filePath);
  const guildBalances = data.balances[guildId] || {};
  const users = Object.keys(guildBalances).length;
  const points = Object.values(guildBalances).reduce((total, balance) => total + balance, 0);
  delete data.balances[guildId];
  writePoints(data, filePath);
  return { users, points };
}

module.exports = {
  adjustPoints,
  createPendingReview,
  getPoints,
  getReview,
  markReviewLogged,
  readPoints,
  resetPoints,
  resolveReview
};
