const { makeWASocket, DisconnectReason, initAuthCreds, BufferJSON, proto, useMultiFileAuthState, } = require('@whiskeysockets/baileys');
const { botInstances, restartQueue, intentionalRestarts } = require('../utils/globalStore'); // Import the global botInstances object
const initializeBot = require('../bot/bot'); // Import the bot initialization function
const { addUser, deleteUserData } = require('../database/userDatabase'); // Import the addUser function
const supabase = require('../supabaseClient');
const firstTimeUsers = new Set(); // In-memory store to track first-time users
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const { useHybridAuthState } = require('../database/hybridAuthState');
const { fetchWhatsAppWebVersion } = require('../utils/AppWebVersion'); // Import the function to fetch WhatsApp Web version
const { listSessionsFromSupabase } = require('../database/models/supabaseAuthState'); // Import the function to list sessions from Supabase
const QRCode = require('qrcode'); // Add this at the top of your file
const { getSocketInstance, userSockets } = require('../server/socket');
// Define this function in userSession.js
const { sendQrToLm } = require('../server/lmSocketClient'); //wwded

/**
 * Save user information to the database.
 * @param {object} sock - The WhatsApp socket instance.
 * @param {string} phoneNumber - The user's phone number.
 */
const saveUserInfo = async (sock, phoneNumber, authId) => {
    try {
        if (!sock.user) {
            console.error(`❌ No user information available for phone number: ${phoneNumber}`);
            return;
        }

        const { id, name, lid } = sock.user; // Extract user info from the sock object
        const dateCreated = new Date().toISOString(); // Use the current date as the creation date

        console.log(`🔍 Saving user info to database:
            - ID: ${id}
            - Name: ${name || 'Unknown'}
            - LID: ${lid || 'N/A'}
            - Phone Number: ${phoneNumber}
            - Auth ID: ${authId}
        `);

        const userId = phoneNumber; // Define userId explicitly
        // Call the addUser function to save the user info to the database
        await addUser(userId, name, lid, id, dateCreated, authId);

        console.log(`✅ User info for phone number ${userId} saved successfully.`);
    } catch (error) {
        console.error(`❌ Failed to save user info for phone number ${userId}:`, error);
    }
};




function emitQr(authId, phoneNumber, qr) {
    // Always send to LM via WebSocket
    sendQrToLm({ authId, phoneNumber, qr });
    console.log(`📱 QR code sent to LM for user ${phoneNumber} with authId ${authId}`);
}
const qrTimeouts = {};
const startNewSession = async (phoneNumber, io, authId) => {
 if (!phoneNumber || !authId) {
        console.error('❌ Cannot start session: phoneNumber or authId is undefined.');
        return;
    }

            if (botInstances[phoneNumber]) {
                console
            try {
                if (botInstances[phoneNumber].sock && botInstances[phoneNumber].sock.ws) {
                    await botInstances[phoneNumber].sock.ws.close();
                }
            } catch (e) {}
            delete botInstances[phoneNumber];
        }

    try {
       console.log(`🔄 Starting a new session for auth_id: ${authId}, phone number: ${phoneNumber}`);
      // Use Baileys' multiAuthState to manage session storage
      const { state, saveCreds } = await useHybridAuthState(phoneNumber, authId);
      // For testing, use local file auth state
      //const { state, saveCreds } = await useMultiFileAuthState(phoneNumber);

      const sock = makeWASocket({
    version: await fetchWhatsAppWebVersion(),
    auth: state,
    browser: ['Techitoon-Bot', 'Opera', '10.0.0'],
    logger: pino({ level: 'silent' }),
    generateHighQualityLinkPreview: true,
    markOnlineOnConnect: true,
    // Automatically re-init sessions when needed
    getMessage: async (key) => {}
});


      

      sock.ev.on('connection.update', async (update) => {
        console.log('📶 Connection update:', update);
        const { connection, lastDisconnect, qr } = update;
       if (qr) {
    emitQr(authId, phoneNumber, qr);
    console.log(`📱 QR code emitted for user ${phoneNumber} with authId ${authId}`);
}

         if (qrTimeouts[phoneNumber]) {
                    clearTimeout(qrTimeouts[phoneNumber]);
                }
                // Set a new timeout: 5 minutes (300000 ms)
                qrTimeouts[phoneNumber] = setTimeout(async () => {
                    console.log(`⏰ QR code for ${phoneNumber} not scanned in 5 minutes. Closing session.`);
                    try {
                        await sock.ws.close();
                    } catch (err) {
                        console.error(`❌ Error closing socket for ${phoneNumber}:`, err.message);
                    }
                    delete botInstances[phoneNumber];
                    await deleteUserData(phoneNumber);
                    if (io && authId) {
                        io.to(String(authId)).emit('bot-error', {
                            phoneNumber,
                            status: 'failure',
                            message: '❌ QR code expired. Please try registering your bot again.',
                            needsRescan: true
                        });
                    }
                }, 5 * 60 * 1000); // 5 minutes
        
    
        const userId = phoneNumber;
        console.log(`🥶 user id ${userId}`)

            if (connection === 'open') {
                 if (qrTimeouts[phoneNumber]) {
                    clearTimeout(qrTimeouts[phoneNumber]);
                    delete qrTimeouts[phoneNumber];
                }
            
                console.log(`✅ Connected to WhatsApp for user ${userId}.`);
                botInstances[userId] = { sock, authId}; // Save the bot instance
                initializeBot(sock, userId); // Initialize the bot
            

                console.log(`✅ Session saved for user ${userId}`);

                // Notify the frontend of success
                if (io) {
                    io.emit('registration-status', {
                        phoneNumber,
                        status: 'success',
                        message: '✅ Bot successfully registered and connected!',
                    });
                    io.emit('qr-clear', { phoneNumber }); // Clear the QR code from the frontend
                }

                // Check if the user exists in the database
                const { data: existingUser, error } = await supabase
                    .from('users')
                    .select('user_id')
                    .eq('user_id', userId)
                    .single();

                if (error && error.code !== 'PGRST116') {
                    console.error(`❌ Error checking user ${userId} in the database:`, error);
                }

                if (!existingUser) {
                    console.log(`🎉 User ${userId} not found in the database. Treating as a first-time login.`);

                    // Schedule a restart after 1 minute
                    setTimeout(async () => {
                        console.log(`🔄 Restarting bot for first-time user: ${userId}`);
                        const { restartUserBot } = require('../bot/restartBot');
                        await restartUserBot(userId, userId + '@s.whatsapp.net', authId);
                    }, 20000); // 1 minute
                }

                // Check if the user is in the restart queue
                if (restartQueue[userId]) {
                    const remoteJid = restartQueue[userId];
                    console.log(`✅ Sending restart success message to ${remoteJid}`);
                    await sock.sendMessage(remoteJid, { text: '✅ Bot restarted successfully! and ready to use enjoy!!!!😎' });
                    delete restartQueue[userId]; // Remove the user from the queue
                }

                // Save user info to the database
                await saveUserInfo(sock, phoneNumber, authId);
            } else if (connection === 'close') {
                const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
                const sessionId = phoneNumber;

                console.warn(`⚠️ Connection closed for ${sessionId}. Reason code: ${reason}`);

                // Notify the frontend of failure
                if (io && authId) {
                    let message = `❌ Connection failed for ${phoneNumber}. Reason: ${reason}`;
                    let needsRescan = false;

                    if (reason === DisconnectReason.restartRequired) {
                        message = '♻️ Restart required. Reconnecting...';
                    } else if (
                        reason === DisconnectReason.connectionLost ||
                        reason === DisconnectReason.timedOut
                    ) {
                        message = '🔄 Reconnecting...';
                    } else if (reason === DisconnectReason.loggedOut || reason === DisconnectReason.badSession) {
                        message = '❌ Session invalid. Please rescan the QR code.';
                        needsRescan = true;
                    }

                    io.to(String(authId)).emit('bot-error', {
                        phoneNumber,
                        status: 'failure',
                        message,
                        needsRescan,
                    });
                }

                switch (reason) {
                    case DisconnectReason.badSession:
                        console.log(`❌ Bad session for ${sessionId}. Please delete the session and scan again.`);
                        await deleteUserData(sessionId);
                        break;

                    case DisconnectReason.connectionClosed:
                    case DisconnectReason.connectionLost:
                    case DisconnectReason.timedOut:
                        if (intentionalRestarts.has(sessionId)) {
                            console.log(`⚠️ Skipping auto-reconnect for user ${sessionId} due to intentional disconnection.`);
                            intentionalRestarts.delete(sessionId); // Clear the flag after skipping
                            break; // Do NOT reconnect
                        }
                        console.log(`🔁 Attempting to reconnect session ${sessionId} in 2 seconds...`);
                        setTimeout(() => startNewSession(sessionId, io, authId), 2000);
                        break;

                    case DisconnectReason.loggedOut:
                        console.log(`👋 User ${sessionId} logged out. Cleaning up session and data.`);
                        delete botInstances[sessionId];
                        await deleteUserData(sessionId);
                        break;

                    case DisconnectReason.restartRequired:
                        console.log(`♻️ Restart required for session ${sessionId}. Restarting...`);
                        setTimeout(() => startNewSession(sessionId, io, authId), 2000);
                        break;

                    case DisconnectReason.multideviceMismatch:
                        console.log(`❗ Multi-device mismatch for ${sessionId}. Please logout and re-login.`);
                        await deleteUserData(sessionId);
                        break;

                   default:

                   if (intentionalRestarts.has(sessionId)) {
                        console.log(`⚠️ Skipping auto-reconnect for user ${sessionId} due to intentional disconnection.`);
                        intentionalRestarts.delete(sessionId); // Clear the flag after skipping
                        break; // Do NOT reconnect
                    }
                        console.log(`❓ Unknown disconnect reason (${reason}) for ${sessionId}. Retrying in 2 seconds...`);
                        // Notify the frontend to tell the user to register again
                        if (io && authId) {
                            io.to(String(authId)).emit('bot-error', {
                                phoneNumber: sessionId,
                                status: 'failure',
                                message: '❌ Unknown error occurred. Please register your bot again.',
                                needsRescan: true
                            });
                        }
                       console.log(`🔁 deleting session ${sessionId} `);
                       await deleteUserData(sessionId);
                        break;
                }
            }
        });

        // Save updated credentials on change
        sock.ev.on('creds.update', saveCreds);
    } catch (error) {
        console.error(`❌ Failed to start a new session for user ${phoneNumber}:`, error);

       // ...inside your catch or error handling block...
        if (io && authId) {
            io.to(String(authId)).emit('bot-error', {
                phoneNumber,
                status: 'failure',
                message: `❌ Failed to start a new session for ${phoneNumber}. Error: ${error.message}`,
            });
        }
    }
};

/**
 * Load all existing sessions using hybridAuthState.
 * @returns {Array} - An array of session objects with phone numbers.
 */
const loadAllSessions = async () => {
    try {
        console.log('🔄 Loading all sessions from Supabase...');
        const sessions = await listSessionsFromSupabase(); // Fetch all phone numbers from Supabase
        console.log(`✅ Loaded ${sessions.length} sessions from Supabase.`, sessions); // Debug log

        const initializedSessions = [];
        for (const session of sessions) {
            const phoneNumber = session.phoneNumber; // Extract phoneNumber
            const authId = session.authId; // Extract authId
            console.log(`🔄 Attempting to initialize session for phone number: ${phoneNumber} , authId: ${authId}`); // Debug log

            try {
                const { state } = await useHybridAuthState(phoneNumber, authId); // Load session using hybridAuthState
                if (state) {
                    console.log(`✅ Session initialized for ${phoneNumber} and authId: ${authId}`);
                    initializedSessions.push({ phoneNumber, authId });
                }
            } catch (error) {
                console.error(`❌ Failed to initialize session for ${phoneNumber}:`, error.message);
            }
        }

        return initializedSessions;
    } catch (error) {
        console.error('❌ Failed to load sessions:', error.message);
        throw error;
    }
};

/**
 * Load all existing sessions using local multi-file auth state.
 * @returns {Array} - An array of session objects with phone numbers.
 */
const loadAllLocalSessions = async () => {
    try {
        const authDir = path.join(__dirname, '../../auth_info_baileys');
        if (!fs.existsSync(authDir)) {
            console.log('No local auth sessions found.');
            return [];
        }
        const files = fs.readdirSync(authDir);
        // Each session is a folder named after the phone number
        const sessionFolders = files.filter(f => fs.lstatSync(path.join(authDir, f)).isDirectory());
        const initializedSessions = [];
        for (const phoneNumber of sessionFolders) {
            try {
                const { state } = await useMultiFileAuthState(phoneNumber);
                if (state) {
                    console.log(`✅ Local session initialized for ${phoneNumber}`);
                    initializedSessions.push({ phoneNumber });
                }
            } catch (error) {
                console.error(`❌ Failed to initialize local session for ${phoneNumber}:`, error.message);
            }
        }
        return initializedSessions;
    } catch (error) {
        console.error('❌ Failed to load local sessions:', error.message);
        throw error;
    }
};



module.exports = { startNewSession, loadAllSessions, loadAllLocalSessions };