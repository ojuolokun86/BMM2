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
const { sendQrToLm } = require('../server/lmSocketClient');
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
        console.error('❌ Cannot start session: phoneNumber or authId missing.');
        return { status: 'error', message: 'Phone number or Auth ID missing' };
    }

    if (botInstances[phoneNumber]) {
        try { if (botInstances[phoneNumber].sock?.ws) await botInstances[phoneNumber].sock.ws.close(); } catch {}
        delete botInstances[phoneNumber];
    }

    console.log(`🔄 Starting session for ${phoneNumber} with authId ${authId}`);
    const { state, saveCreds } = await useHybridAuthState(phoneNumber, authId);

    const sock = makeWASocket({
        version: await fetchWhatsAppWebVersion(),
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['Chrome', 'Safari', '10.0'],
        generateHighQualityLinkPreview: true,
        markOnlineOnConnect: true,
        getMessage: async () => {}
    });

    sock.ev.on('creds.update', saveCreds);

    let pairingRequested = false;
    let pairingTimeout = null;

    // Connection Updates
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        console.log(`📶 Connection update for ${phoneNumber}:`, connection, update);

        // 1️⃣ Request pairing code when qr is present and not already requested
        if (!sock.authState.creds.registered && qr && !pairingRequested) {
            pairingRequested = true;
            try {
                const pairingCode = await sock.requestPairingCode(phoneNumber);
                const formattedCode = pairingCode.match(/.{1,4}/g).join('-');
                console.log(`🎉 Pairing code for ${phoneNumber}: ${formattedCode}`);
                sendQrToLm({ authId, phoneNumber, pairingCode: formattedCode });
                // Optional: Start a timeout to retry if user doesn't pair in time
                pairingTimeout = setTimeout(() => {
                    pairingRequested = false;
                    try { sock.ws.close(); } catch {}
                    setTimeout(() => startNewSession(phoneNumber, io, authId), 2000);
                }, 120000); // 2 minutes
            } catch (err) {
                console.error('❌ Pairing code generation failed:', err);
                pairingRequested = false;
                sendQrToLm({
                    authId,
                    phoneNumber,
                    status: 'failure',
                    message: '❌ Failed to generate pairing code. Please try again.',
                    needsRescan: true,
                });
            }
        }

        // 2️⃣ On successful connection
        if (connection === 'open') {
            if (pairingTimeout) {
                clearTimeout(pairingTimeout);
                pairingTimeout = null;
            }
            pairingRequested = false;
            console.log(`✅ Connected for ${phoneNumber}`);
            botInstances[phoneNumber] = { sock, authId };
            initializeBot(sock, phoneNumber);
            console.log(`✅ Session saved for user ${phoneNumber} with authId ${authId}`);
            // 🔍 Supabase User Check + Restart Logic
            const { data: existingUser, error } = await supabase
                .from('users').select('user_id').eq('user_id', phoneNumber).single();
            if (error && error.code !== 'PGRST116') console.error('❌ Supabase error:', error);
            if (!existingUser) {
                console.log(`🎉 First-time user detected. Scheduling restart...`);
                setTimeout(async () => {
                    const { restartUserBot } = require('../bot/restartBot');
                    await restartUserBot(phoneNumber, `${phoneNumber}@s.whatsapp.net`, authId);
                }, 20000);
            }
            await saveUserInfo(sock, phoneNumber, authId);
            if (restartQueue[phoneNumber]) {
                await sock.sendMessage(restartQueue[phoneNumber], { text: '✅ Bot restarted successfully!' });
                delete restartQueue[phoneNumber];
            }
            if (io) io.to(String(authId)).emit('registration-status', { phoneNumber, status: 'success', message: '✅ Bot connected!' });
        }

        // 3️⃣ On connection close, retry if not registered
        if (connection === 'close' && !sock.authState.creds.registered) {
            pairingRequested = false;
            if (pairingTimeout) {
                clearTimeout(pairingTimeout);
                pairingTimeout = null;
            }
            setTimeout(() => startNewSession(phoneNumber, io, authId), 2000);
            return;
        }

        // 4️⃣ On connection close for other reasons
        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            console.warn(`⚠️ Connection closed for ${phoneNumber}: ${reason}`);
            if ([DisconnectReason.restartRequired, DisconnectReason.connectionLost, DisconnectReason.timedOut].includes(reason)) {
                setTimeout(() => startNewSession(phoneNumber, io, authId), 2000);
            } else if ([DisconnectReason.loggedOut, DisconnectReason.badSession].includes(reason)) {
                await deleteUserData(phoneNumber);
            }
        }
    });
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