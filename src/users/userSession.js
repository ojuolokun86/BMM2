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

const Browsers = {
    macOS: () => ['WhatsApp', 'MacOS', '10.15.7'],
    Windows: () => ['WhatsApp', 'Windows', '10'],
    Linux: () => ['WhatsApp', 'Linux', 'Ubuntu'],
    Android: () => ['WhatsApp', 'Android', '11'],
    iOS: () => ['WhatsApp', 'iOS', '15.3'],
    Chrome: () => ['WhatsApp', 'Chrome', '114.0.5735.199'],
    Firefox: () => ['WhatsApp', 'Firefox', '113.0'],
    Edge: () => ['WhatsApp', 'Edge', '114.0.1823.67'],
    Opera: () => ['WhatsApp', 'Opera', '99.0.4788.77'],
    Brave: () => ['WhatsApp', 'Brave', '1.52.129'],
    Samsung: () => ['WhatsApp', 'Samsung', '20.0'],
    Ubuntu: () => ['WhatsApp', 'Ubuntu', '22.04'],
    Fedora: () => ['WhatsApp', 'Fedora', '38'],
    Debian: () => ['WhatsApp', 'Debian', '12'],
    CentOS: () => ['WhatsApp', 'CentOS', '8'],
    Safari: () => ['WhatsApp', 'Safari', '16.5'],           // Added Safari
    Vivaldi: () => ['WhatsApp', 'Vivaldi', '6.1'],          // Added Vivaldi
    Yandex: () => ['WhatsApp', 'Yandex', '23.5.0.2263'],    // Added Yandex
    QQ: () => ['WhatsApp', 'QQ', '11.7'],                   // Added QQ Browser
    UC: () => ['WhatsApp', 'UC', '13.4.0.1306'],            // Added UC Browser
    Maxthon: () => ['WhatsApp', 'Maxthon', '7.0.2.2600'],   // Added Maxthon
    // Add more as needed
};


function emitQr(authId, phoneNumber, qr) {
    // Always send to LM via WebSocket
    sendQrToLm({ authId, phoneNumber, pairingCode: formattedCode });
    console.log(`📱 QR code sent to LM for user ${phoneNumber} with authId ${authId}`);
}
const qrTimeouts = {};

let pairingRequested = false;
let pairingTimeout = null;
let pairingAttempts = 0;
const MAX_PAIRING_ATTEMPTS = 1; // Only try once per deploy
const PAIRING_WINDOW = 120000; // 2 minutes
const startNewSession = async (phoneNumber, io, authId, pairingMethod, platform) => {
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

    const selectedPlatform = platform && Browsers[platform] ? platform : 'Linux';
    const browser = Browsers[selectedPlatform]();
    browser[2] = version.join('.');
    console.log(`🌐 Using browser: ${browser.join(' ')}`);

    console.log(`🔄 Starting session for ${phoneNumber} with authId ${authId}`);
    const { state, saveCreds } = await useHybridAuthState(phoneNumber, authId);

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser,
        generateHighQualityLinkPreview: true,
        markOnlineOnConnect: true,
        getMessage: async () => {}
    });

    sock.ev.on('creds.update', saveCreds);

    let lastEventTime = Date.now();
const WATCHDOG_TIMEOUT = 10 * 60 * 1000; // 10 minutes

setInterval(() => {
    if (Date.now() - lastEventTime > WATCHDOG_TIMEOUT) {
        console.warn(`⚠️ No events received for ${phoneNumber} in ${WATCHDOG_TIMEOUT / 60000} minutes. Forcing reconnect...`);
        try { sock.ws.close(); } catch {}
        // Add this to trigger a reconnect after closing
        setTimeout(() => {
            if (!intentionalRestarts.has(phoneNumber)) {
                startNewSession(phoneNumber, io, authId, pairingMethod, platform);
            }
        }, 2000); // Wait 2 seconds before reconnecting
    }
}, 60000); // Check every minute
    let pairingRequested = false;
    let pairingTimeout = null;
    const userId = phoneNumber; // Define userId explicitly
      const heartbeatInterval = setInterval(async () => {
    // If intentional restart, skip all heartbeat actions
    if (intentionalRestarts.has(phoneNumber)) {
        console.log(`💚 Heartbeat: Skipping for intentional restart of ${phoneNumber}`);
        clearInterval(heartbeatInterval);
        return;
    }

    // Only act if socket is truly open
    if (sock?.ws?.readyState === 1) { // OPEN
        try {
            await sock.sendPresenceUpdate('available');
            console.log(`💓 Heartbeat sent for ${phoneNumber}`);
        } catch (err) {
            console.error(`💔 Heartbeat failed for ${phoneNumber}, reconnecting...`, err.message);
            clearInterval(heartbeatInterval);
            if (!intentionalRestarts.has(phoneNumber)) {
                try { sock.ws.close(); } catch {}
                startNewSession(phoneNumber, io, authId, pairingMethod);
            }
        }
    } else if (sock?.ws?.readyState === 2 || sock?.ws?.readyState === 3) { // CLOSING or CLOSED
        console.warn(`⚠️ WebSocket not open for ${phoneNumber}, reconnecting...`);
        clearInterval(heartbeatInterval);
        if (!intentionalRestarts.has(phoneNumber)) {
            try { sock.ws.close(); } catch {}
            startNewSession(phoneNumber, io, authId, pairingMethod);
        }
    }
}, 30000); // Every 30s

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
        if (!sock.authState.creds.registered && qr && !pairingRequested) {
        pairingRequested = true;
        try {
            if (pairingMethod === 'pairingCode') {
                // Only request pairing code if user chose it
                const pairingCode = await sock.requestPairingCode(phoneNumber);
                const formattedCode = pairingCode.match(/.{1,4}/g).join('-');
                console.log(`🎉 Pairing code for ${phoneNumber}: ${formattedCode}`);
                sendQrToLm({ authId, phoneNumber, pairingCode: formattedCode });
            } else if (pairingMethod === 'qrCode') {
                // Only send QR if user chose QR
                console.log(`📱 QR code for ${phoneNumber} sent`);
                sendQrToLm({ authId, phoneNumber, qr });
            } else {
                // Fallback: send QR if method is unknown
                console.log(`📱 [fallback] QR code for ${phoneNumber} sent`);
                sendQrToLm({ authId, phoneNumber, qr });
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
                    await restartUserBot(phoneNumber, `${phoneNumber}@s.whatsapp.net`, authId, platform);
                }, 20000);
                }
                await saveUserInfo(sock, phoneNumber, authId, platform);
            if (restartQueue[phoneNumber]) {
                await sock.sendMessage(restartQueue[phoneNumber], { text: '*🤖 Congratulation YOU have successfuly registered the bot! connected to BMM Techitoon Bot 🚀*' });
                delete restartQueue[phoneNumber];
            }
            if (io) io.to(String(authId)).emit('registration-status', { phoneNumber, status: 'success', message: '✅ Bot connected!' });
        }

     if (connection === 'close') {
    const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
    console.warn(`⚠️ Connection closed for ${phoneNumber}: ${reason}`);

     // 🟢 NEW: If this was an intentional restart, do nothing!
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
        // Do NOT retry here!
        return;
    }
    // If registration is NOT complete
    if (!sock.authState.creds.registered) {
        pairingRequested = false;
        if (pairingTimeout) {
            clearTimeout(pairingTimeout);
            pairingTimeout = null;
        }

        // --- QR code: if restart/timeout/lost, just retry quietly ---
        if (
            pairingMethod === 'qrCode' &&
            [DisconnectReason.restartRequired, DisconnectReason.connectionLost, DisconnectReason.timedOut, 428].includes(reason)
        ) {
            console.warn(`🔄 [QR] Restarting session for ${phoneNumber} after connection close (${reason})`);
            setTimeout(() => startNewSession(phoneNumber, io, authId, pairingMethod, platform), 2000);
            return; // Do NOT delete user data or notify frontend
        }

        // --- Pairing code or other QR failures: cleanup and notify ---
        // (also handles QR code if reason is not a simple restart)
        if (
            pairingMethod === 'pairingCode' ||
            ![DisconnectReason.restartRequired, DisconnectReason.connectionLost, DisconnectReason.timedOut].includes(reason)
        ) {
            // Delete bot instance
            if (botInstances[phoneNumber]) {
                try { await botInstances[phoneNumber].sock.ws.close(); } catch {}
                delete botInstances[phoneNumber];
            }
            await deleteUserData(phoneNumber);
            console.warn(`❌ Pairing failed or expired for ${phoneNumber}. User data deleted.`);

            // Notify frontend to redeploy
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
    if ([DisconnectReason.restartRequired, DisconnectReason.connectionLost, DisconnectReason.timedOut, 428].includes(reason)) {
        setTimeout(() => startNewSession(phoneNumber, io, authId, pairingMethod), 2000);
    } else if ([DisconnectReason.loggedOut, DisconnectReason.badSession].includes(reason)) {
        await deleteUserData(phoneNumber);
        sendQrToLm({
            authId,
            phoneNumber,
            status: 'failure',
            message: '❌ Pairing failed or expired. Please redeploy the bot to get a new code.',
            needsRescan: true,
        });
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


module.exports = { startNewSession, loadAllSessions, loadAllLocalSessions, fullyStopSession };