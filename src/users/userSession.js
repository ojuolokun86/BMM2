const { makeWASocket, DisconnectReason, initAuthCreds, BufferJSON, proto, useMultiFileAuthState, } = require('@whiskeysockets/baileys');
const { botInstances, restartQueue, intentionalRestarts, lmSocketInstances, } = require('../utils/globalStore'); // Import the global botInstances object
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

const sessionTimers = {};
const cancelledSessions = new Set();

async function fullyStopSession(phoneNumber) {
    console.log(`🛑 Fully stopping session for ${phoneNumber}`);
    // Clear all timeouts/intervals
    if (sessionTimers[phoneNumber]) {
        sessionTimers[phoneNumber].forEach(clearInterval);
        delete sessionTimers[phoneNumber];
        cancelledSessions.add(phoneNumber);
        console.log(`⏹️ All timers cleared for ${phoneNumber}`);
    } else {
        console.log(`ℹ️ No timers found for ${phoneNumber}`);
    }
    // Remove event listeners and close socket
    if (botInstances[phoneNumber]) {
        console.log(`🔌 Closing socket for ${phoneNumber}`);
        try {
            const sock = botInstances[phoneNumber].sock;
            if (sock?.ws) {
                sock.ev.removeAllListeners();
                if (typeof sock.ws.terminate === 'function') {
                    sock.ws.terminate();
                    console.log(`✅ Socket for ${phoneNumber} terminated immediately.`);
                } else {
                    await sock.ws.close();
                    console.log(`✅ Socket for ${phoneNumber} closed gracefully.`);
                }
            }
        } catch (err) {
            console.warn(`⚠️ Error closing socket for ${phoneNumber}:`, err.message);
        }
        delete botInstances[phoneNumber];
        console.log(`🗑️ Bot instance for ${phoneNumber} deleted.`);
    } else {
        console.log(`ℹ️ No bot instance found for ${phoneNumber}`);
    }
}



const { sendQrToLm } = require('../server/lmSocketClient');
const { platform } = require('os');
/**
 * Save user information to the database.
 * @param {object} sock - The WhatsApp socket instance.
 * @param {string} phoneNumber - The user's phone number.
 */
const saveUserInfo = async (sock, phoneNumber, authId, platform) => {
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
            - Platform: ${platform}
        `);

        const userId = phoneNumber; // Define userId explicitly
        // Call the addUser function to save the user info to the database
        await addUser(userId, name, lid, id, dateCreated, authId, platform);

        console.log(`✅ User info for phone number ${userId} saved successfully.`);
    } catch (error) {
        console.error(`❌ Failed to save user info for phone number ${userId}:`, error);
    }
};


function emitQr(authId, phoneNumber, qr) {
    // Always send to LM via WebSocket
    sendQrToLm({ authId, phoneNumber, pairingCode: formattedCode });
    console.log(`📱 QR code sent to LM for user ${phoneNumber} with authId ${authId}`);
}
const qrTimeouts = {};

const pairingRequestedMap = new Map(); // key: phoneNumber

let pairingTimeout = null;
let pairingAttempts = 0;
const MAX_PAIRING_ATTEMPTS = 1; // Only try once per deploy
const PAIRING_WINDOW = 120000; // 2 minutes
const startNewSession = async (phoneNumber, io, authId, pairingMethod) => {
    console.log(`🔄 Starting new session for phone: ${phoneNumber}, authId: ${authId}, pairingMethod: ${pairingMethod}`);
    if (!phoneNumber || !authId) {
        console.error('❌ Cannot start session: phoneNumber or authId missing.');
        return { status: 'error', message: 'Phone number or Auth ID missing' };
    }

    if (botInstances[phoneNumber]) {
        try { if (botInstances[phoneNumber].sock?.ws) await botInstances[phoneNumber].sock.ws.close(); } catch {}
        delete botInstances[phoneNumber];
    }
    const  version  = await fetchWhatsAppWebVersion();
    console.log(`🔄 Starting session for ${phoneNumber} with authId ${authId}`);
    const { state, saveCreds } = await useHybridAuthState(phoneNumber, authId);

   const sock = makeWASocket({
    version: await fetchWhatsAppWebVersion(),
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Linux', 'Edge', '110.0.5481.77'],
    generateHighQualityLinkPreview: true,
    downloadHistory: true,
    syncFullHistory: true,
    forceWeb: true,
    forceWebReconnect: true,
    markOnlineOnConnect: false,
    receivedPendingNotifications: true,
    keepAliveIntervalMs: 30000, // Ping WhatsApp every 30s
    connectTimeoutMs: 60000, // 60s timeout
    emitOwnEvents: true, // emits your own messages (fromMe)
    linkPreviewImageThumbnailWidth: 100, // thumbnail preview size
    getMessage: async () => {},
    // patchMessageBeforeSending: async (msg) => msg, // Optional placeholder
    appStateSyncIntervalMs: 60000, // Sync app state every 60s
    appState: state,
});
const pairingAttemptsMap = new Map(); // key: phoneNumber, value: attempts
    sock.ev.on('creds.update', saveCreds);
    console.log(`🚀creds update`)
    console.info("📦 Loaded state:", state?.creds?.registered);
    // Connection Updates
    sock.ev.on('connection.update', async (update) => {
        if (cancelledSessions.has(phoneNumber)) {
        console.log(`⏹️ Ignoring event for cancelled session ${phoneNumber}`);
        return;
    }
        lastEventTime = Date.now(); // Update last event time on any connection update
        const { connection, lastDisconnect, qr } = update;
        console.log(`📶 Connection update for ${phoneNumber}:`, connection, update);

        // 1️⃣ Request pairing code when qr is present and not already requested
        if (!sock.authState.creds.registered && qr && !pairingRequestedMap.get(phoneNumber)) {
         pairingRequestedMap.set(phoneNumber, true);

    // Increment pairing attempts
            const attempts = (pairingAttemptsMap.get(phoneNumber) || 0) + 1;
            pairingAttemptsMap.set(phoneNumber, attempts);

            if (attempts > MAX_PAIRING_ATTEMPTS) {
                console.warn(`❌ Max pairing attempts reached for ${phoneNumber}. Deleting session and not reconnecting.`);
                await fullyStopSession(phoneNumber);
                await deleteUserData(phoneNumber);
                sendQrToLm({
                    authId,
                    phoneNumber,
                    status: 'failure',
                    message: '❌ Max pairing attempts reached. Please redeploy the bot to try again.',
                    needsRescan: true,
                });
                return; // Do not continue or retry
            }
    
        try {
            if (pairingMethod === 'pairingCode') {
                // Only request pairing code if user chose it
                const pairingCode = await sock.requestPairingCode(phoneNumber);
                const formattedCode = pairingCode.match(/.{1,4}/g).join('-');
                console.info(`🎉 Pairing code for ${phoneNumber}: ${formattedCode}`);
                sendQrToLm({ authId, phoneNumber, pairingCode: formattedCode });
            } else if (pairingMethod === 'qrCode') {
                // Only send QR if user chose QR
                console.info(`📱 QR code for ${phoneNumber} sent`);
                sendQrToLm({ authId, phoneNumber, qr });
           } else {
                console.error(`❌ Invalid pairing method: ${pairingMethod}`);
                // Clean up any partial session
                await fullyStopSession(phoneNumber);
                await deleteUserData(phoneNumber);
                sendQrToLm({
                    authId,
                    phoneNumber,
                    status: 'failure',
                    message: '❌ Invalid pairing method. Please try again with a valid method.',
                    needsRescan: true,
                });
                return; // Stop further execution
            }
            pairingTimeout = setTimeout(() => {
                pairingRequested = false;
                try { sock.ws.close(); } catch {}
            }, PAIRING_WINDOW);
        } catch (err) {
            console.error('❌ Pairing code/QR generation failed:', err);
            pairingRequested = false;
            sendQrToLm({
                authId,
                phoneNumber,
                status: 'failure',
                message: '❌ Failed to generate pairing code/QR. Please try again.',
                needsRescan: true,
            });
        }
    }

        // 2️⃣ On successful connection
      if (connection === 'open') {
        // 1️⃣ Clear pairing timeout if set
        if (pairingTimeout) {
            clearTimeout(pairingTimeout);
            pairingTimeout = null;
        }
        pairingRequested = false;

        // 2️⃣ Mark as connected and store bot instance
        console.log(`✅ Connected for ${phoneNumber}`);
        botInstances[phoneNumber] = { sock, authId };

      
          // 3️⃣ Upload pre-keys to WhatsApp (ensures encryption is fresh)
        try {
            console.log(`🔄 Uploading pre-keys for ${phoneNumber}`);
            await sock.uploadPreKeys();
            console.log(`✅ Pre-keys uploaded to WhatsApp for ${phoneNumber}`);
        } catch (err) {
            console.warn(`⚠️ Failed to upload pre-keys:`, err.message);
        }

        try {
            await sock.assertSessions([`${phoneNumber}@s.whatsapp.net`]);
            console.log(`✅ session assert  uploaded to WhatsApp for ${phoneNumber}`);
        } catch (error) {
            console.warn(`⚠️ Failed to assert session:`, error.message);
        }
        // 4️⃣ Initialize the bot logic for this user
        initializeBot(sock, phoneNumber);

        // 5️⃣ Save user info to database
        console.log(`✅ Session saved for user ${phoneNumber} with authId ${authId}`);
        try {
            // Check if user already exists in Supabase
            const { data: existingUser, error } = await supabase
                .from('users')
                .select('user_id')
                .eq('user_id', phoneNumber)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('❌ Supabase error:', error);
            }

            // If first-time user, schedule a restart for full initialization
            if (!existingUser) {
                console.log(`🎉 First-time user detected. Scheduling restart...`);
                setTimeout(async () => {
                    const { restartUserBot } = require('../bot/restartBot');
                    await restartUserBot(phoneNumber, `${phoneNumber}@s.whatsapp.net`, authId);
                }, 20000);
            }

            await saveUserInfo(sock, phoneNumber, authId);
        } catch (err) {
            console.error(`❌ Error during user info save/check:`, err);
        }

        // 6️⃣ Notify user if in restartQueue
        if (restartQueue[phoneNumber]) {
            try {
                await sock.sendMessage(
                    restartQueue[phoneNumber],
                    { text: '*🤖 Congratulation YOU have successfuly registered the bot! connected to BMM Techitoon Bot 🚀*' }
                );
            } catch (err) {
                console.warn(`⚠️ Failed to send registration message:`, err.message);
            }
            delete restartQueue[phoneNumber];
        }

        // 7️⃣ Emit registration status to frontend/LM
        if (io) {
            io.to(String(authId)).emit('registration-status', {
                phoneNumber,
                status: 'success',
                message: '✅ Bot connected!',
            });
        }
    }

   if (connection === 'close') {
    const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
    const reasonName = Object.entries(DisconnectReason).find(([k, v]) => v === reason)?.[0] || reason;
    console.warn(`⚠️ Connection closed for ${phoneNumber}: ${reason} (${reasonName})`);

    // 🟢 If this was an intentional restart, do nothing!
    if (intentionalRestarts.has(phoneNumber)) {
        console.log(`🟢 Intentional restart for ${phoneNumber}, skipping auto-restart and cleanup.`);
        intentionalRestarts.delete(phoneNumber);
        return;
    }

    // ⚠️ Handle Baileys conflict (reason 440)
    if (reason === 440) {
        console.warn(`⚠️ Conflict detected for ${phoneNumber}. Cleaning up this instance and NOT retrying.`);
        if (botInstances[phoneNumber]) {
            try {
                if (botInstances[phoneNumber].sock?.ws?.readyState === 1) {
                    await botInstances[phoneNumber].sock.ws.close();
                }
            } catch (err) {
                console.warn(`⚠️ Error closing socket for ${phoneNumber}:`, err.message);
            }
            delete botInstances[phoneNumber];
        }
        return;
    }

    // If registration is NOT complete (user not paired yet)
    if (!sock.authState.creds.registered) {
        pairingRequested = false;
        if (pairingTimeout) {
            clearTimeout(pairingTimeout);
            pairingTimeout = null;
        }

        // --- QR code: if restart/timeout/lost, just retry quietly ---
        if (
            pairingMethod === 'qrCode' &&
            [DisconnectReason.restartRequired, DisconnectReason.connectionLost, DisconnectReason.timedOut, 428, DisconnectReason.unavailableService, DisconnectReason.unknown].includes(reason)
        ) {
            console.warn(`🔄 [QR] Restarting session for ${phoneNumber} after connection close (${reason})`);
            setTimeout(() => startNewSession(phoneNumber, io, authId, pairingMethod), 2000);
            return;
        }

        // --- Pairing code or other QR failures: cleanup and notify ---
       else if (
            pairingMethod === 'pairingCode' ||
            ![DisconnectReason.restartRequired, DisconnectReason.connectionLost, DisconnectReason.timedOut, 428, DisconnectReason.unavailableService, DisconnectReason.unknown].includes(reason)
        ) {
            if (botInstances[phoneNumber]) {
                try { await botInstances[phoneNumber].sock.ws.close(); } catch {}
                delete botInstances[phoneNumber];
            }
            await deleteUserData(phoneNumber);
            console.warn(`❌ Pairing failed or expired for ${phoneNumber}. User data deleted.`);
            sendQrToLm({
                authId,
                phoneNumber,
                status: 'failure',
                message: '❌ Pairing failed or expired. Please redeploy the bot to get a new code.',
                needsRescan: true,
            });
            return;
        }
    }

    // --- If registration WAS complete, handle normal disconnects ---
    switch (reason) {
        case DisconnectReason.restartRequired:
        case DisconnectReason.connectionLost:
        case DisconnectReason.timedOut:
        case DisconnectReason.connectionClosed:
        case DisconnectReason.multideviceMismatch:
        case DisconnectReason.connectionReplaced:
        case DisconnectReason.connectionReconnect:
        case DisconnectReason.unavailableService:
        case DisconnectReason.unknown: // Custom code for "unknown reason"
        case 428: // Custom code for "restart required"
            console.warn(`🔄 Restarting session for ${phoneNumber} after connection close (${reason})`);
            setTimeout(() => startNewSession(phoneNumber, io, authId, pairingMethod), 5000);
            break;
        case DisconnectReason.badSession:
        case DisconnectReason.loggedOut:
        case DisconnectReason.Failure:
        case 405: // Custom code for "bad session"
            await deleteUserData(phoneNumber);
            sendQrToLm({
                authId,
                phoneNumber,
                status: 'failure',
                message: '❌ Pairing failed or expired. Please redeploy the bot to get a new code.',
                needsRescan: false,
            });
            break;
        default:
            console.warn(`⚠️ Unhandled disconnect reason for ${phoneNumber}: ${reason}`);
             setTimeout(() => startNewSession(phoneNumber, io, authId, pairingMethod), 5000);
            break;
    }
};

sock.ev.on('iq', iq => {
    console.log('Received IQ:', iq);
  if (iq.attrs?.id?.startsWith('set-privacy-')) {
    console.log('Privacy update IQ response:', iq);
    if (iq.attrs.type === 'result') {
      // Privacy update succeeded
      // You can emit an event or update some status here if needed
    } else {
      // Privacy update failed or was rejected
    }
  }
});

sock.ev.on('iq', async iq => {
    // Log all IQs for debugging
    console.log('⏮️Received IQ:', iq);

    // Check for new session keys (example: group sender keys)
    if (iq.content && Array.isArray(iq.content)) {
        for (const item of iq.content) {
            if (item.tag === 'skey' || item.tag === 'enc') {
                // This may contain new keys
                console.log('🔑 New key material received in IQ:', item);

                // Save updated keys to Supabase (or your DB)
                if (sock.authState && sock.authState.keys) {
                    const memory = require('../database/models/memory');
                    memory.saveSessionToMemory(phoneNumber, {
                        creds: sock.authState.creds,
                        keys: sock.authState.keys,
                        authId
                    });
                    console.log('✅ Updated session keys saved to memory after IQ event.');
                }
            }
        }
    }
});
    })};

    // Set up this listener once when your bot starts (not inside the command)


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


module.exports = { startNewSession, loadAllSessions, loadAllLocalSessions, fullyStopSession };