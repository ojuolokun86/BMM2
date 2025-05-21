const express = require('express');
require('dotenv').config();
const http = require('http');
const bodyParser = require('body-parser');
const cors = require('cors');
const supabase = require('../supabaseClient');

const { startNewSession } = require('../users/userSession');
const { syncMemoryToSupabase, loadAllSessionsFromSupabase } = require('../database/models/supabaseAuthState');
const { deleteAllUsers } = require('../database/userDatabase');

const { router: adminRoutes } = require('./adminRoutes');
const { router: userRoutes } = require('./userRoutes');
const authRoutes = require('./authRoutes');

const validateToken = require('../middlewares/validateToken');
const { initializeSocket, getCorsOptions } = require('./socket');

const createServer = () => {
  const app = express();
  server = http.createServer(app);
  const io = initializeSocket(server);
  global.io = io;
  const corsOptions = getCorsOptions();
  app.use(cors(corsOptions));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  app.use('/api/admin', adminRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/user', userRoutes);

  // Start a new session
  app.post('/api/start-session', validateToken, async (req, res) => {
    const { phoneNumber, authId } = req.body;
    console.log('Received request to start session:', req.body);
    if (!phoneNumber || !authId) {
      return res.status(400).json({ error: 'Phone number and auth_id are required.' });
    }

    // Fetch subscription info
    const { data: token, error } = await supabase
    .from('subscription_tokens')
    .select('subscription_level, expiration_date')
    .eq('user_auth_id', authId)
    .single();

    if (error || !token) {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    // Count current bots
    const { data: bots } = await supabase
        .from('users')
        .select('user_id')
        .eq('auth_id', authId);

    const botCount = bots ? bots.length : 0;

    // Set limits
 let maxBots = 1, months = 1, days = 0;
  if (token.subscription_level === 'gold') { maxBots = 3; months = 2; }
  if (token.subscription_level === 'premium') { maxBots = 5; months = 3; }
  if (token.subscription_level === 'trier') { maxBots = 1; months = 0; days = 7; }
  if (token.subscription_level === 'basic') { maxBots = 1; months = 1; }

    if (!token || !token.subscription_level) {
    return res.status(403).json({ error: 'No valid subscription found. Please subscribe to use the bot.' });
}

if (token.subscription_level === 'free') {
    // Only allow one bot for free tier
    if (botCount >= 1) {
        return res.status(403).json({ error: 'Free tier allows only one bot. Please upgrade your subscription to add more.' });
    }
}

// ...existing code for gold, premium, etc...
if (botCount >= maxBots) {
    return res.status(403).json({ error: `Your subscription (${token.subscription_level}) allows only ${maxBots} bot(s).` });
}

    // Continue with registration...
    await startNewSession(phoneNumber, io, authId);
    return res.status(200).json({ message: 'Session started. Please scan the QR code.' });
});

  // Delete all users
  app.delete('/api/delete-all-users', async (req, res) => {
    try {
      await deleteAllUsers();
      console.log('✅ All users deleted successfully.');
      return res.status(200).json({ message: 'All users deleted successfully.' });
    } catch (error) {
      console.error('❌ Error deleting all users:', error);
      return res.status(500).json({ error: 'Failed to delete all users.' });
    }
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
  });
};

// Background tasks
loadAllSessionsFromSupabase();
setInterval(() => syncMemoryToSupabase(), 6 * 60 * 60 * 1000);

// Graceful shutdown for all signals
const gracefulShutdown = async (signal) => {
  try {
    console.log(`\n🔄 [${signal}] Syncing memory to Supabase before shutdown...`);
    if (server) {
      server.close(() => {
        console.log('🛑 HTTP server closed.');
      });
    }
    const timeout = setTimeout(() => {
      console.error('❌ Shutdown timed out. Forcing exit.');
      process.exit(1);
    }, 3000); // 3 seconds, adjust as needed

    await syncMemoryToSupabase();
    clearTimeout(timeout);
    console.log('✅ Memory synced to Supabase. Exiting.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error syncing memory to Supabase:', err);
    process.exit(1);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('beforeExit', () => gracefulShutdown('beforeExit'));

module.exports = { createServer };
