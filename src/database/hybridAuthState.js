const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const memory = require('./models/memory'); // In-memory session management
const { saveSessionToSupabase } = require('./models/supabaseAuthState'); // Supabase sync
const { auth } = require('../supabaseClient');

/**
 * Validate session data integrity.
 * @param {Object} data - The session data to validate.
 */
const validateSessionData = (data) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid session data: Not an object');
    if (!data.creds || !data.creds.me || !data.creds.me.id) throw new Error('Invalid session data: Missing credentials');
    if (!data.keys || typeof data.keys !== 'object') throw new Error('Invalid session data: Missing keys');
};

/**
 * Use hybrid auth state with in-memory storage and Supabase sync.
 * @param {string} phoneNumber - The phone number for the session.
 * @returns {Object} - The session state and saveCreds function.
 */
async function useHybridAuthState(phoneNumber, authId) {
    let sessionData = memory.getSessionFromMemory(phoneNumber);

    if (!sessionData) {
    console.log(`⚠️ Session for ${phoneNumber} not found in memory. Initializing new session.`);
    sessionData = { creds: initAuthCreds(), keys: {} };
    memory.saveSessionToMemory(phoneNumber, sessionData, authId);
} else {
    try {
        // Validate credentials
        if (!sessionData.creds || !sessionData.creds.me || !sessionData.creds.me.id) {
            console.warn(`⚠️ Invalid credentials for ${phoneNumber}. Reinitializing session.`);
        // 1. Send notification to the affected user (if you have a socket or notification system)
            // Example: emit a socket event (customize as needed)
            if (global.io && sessionData.authId) {
                global.io.to(String(sessionData.authId)).emit('bot-error', {
                    phoneNumber,
                    status: 'failure',
                    message: '❌ Your session is invalid or expired. Please re-register your bot.',
                    needsRescan: true
                });
            }
             // 2. Delete only the session (from memory and Supabase)
                const { deleteSessionFromMemory } = require('./models/memory');
                const { deleteSessionFromSupabase } = require('./models/supabaseAuthState');
                deleteSessionFromMemory(phoneNumber);
                await deleteSessionFromSupabase(phoneNumber);

                // 3. Do NOT delete the user from the users table

                // 4. Throw an error to prevent further processing
                throw new Error('Invalid credentials: session deleted, user notified.');
            }
            const deserializedKeys = {};
           for (const keyType in sessionData.keys) {
                deserializedKeys[keyType] = {};
                for (const keyId in sessionData.keys[keyType]) {
                    const rawValue = sessionData.keys[keyType][keyId];
                    try {
                        deserializedKeys[keyType][keyId] =
                            typeof rawValue === 'string'
                                ? JSON.parse(rawValue, BufferJSON.reviver)
                                : rawValue; // Already parsed
                    } catch (err) {
                        console.error(`🛑 Failed to parse key ${keyType}/${keyId} for ${phoneNumber}:`, rawValue);
                        throw err;
                    }
                }
            }

            
            sessionData.keys = deserializedKeys;
             sessionData.authId = authId;
        } catch (error) {
            console.error(`❌ Failed to deserialize keys for ${phoneNumber}:`, error.message);
            throw error;
        }
    }
    return {
        state: {
            creds: sessionData.creds,
            keys: {
                get: async (type, ids) => {
                    const result = {};
                    if (sessionData.keys[type]) {
                        for (const id of ids) {
                            if (sessionData.keys[type][id]) {
                                result[id] = sessionData.keys[type][id];
                            }
                        }
                    }
                    return result;
                },
              set: async (data) => {
                for (const category in data) {
                    if (!sessionData.keys[category]) sessionData.keys[category] = {};
                    for (const id in data[category]) {
                        sessionData.keys[category][id] = data[category][id];
                    }
                }

                // // ✅ Ensure creds are valid
                // if (!sessionData.creds || !sessionData.creds.me || !sessionData.creds.me.id) {
                //     console.warn(`⚠️ Missing or invalid creds for ${phoneNumber}. Reinitializing...`);
                //      sessionData.creds = initAuthCreds(); // reinitialize
                // }

                memory.saveSessionToMemory(phoneNumber, sessionData, authId); // Save to memory
            },
            },
        },
        saveCreds: async () => {
            try {
                // Serialize keys for memory and Supabase
                const serializedKeys = {};
                for (const keyType in sessionData.keys) {
                    serializedKeys[keyType] = {};
                    for (const keyId in sessionData.keys[keyType]) {
                        serializedKeys[keyType][keyId] = JSON.stringify(sessionData.keys[keyType][keyId], BufferJSON.replacer);
                    }
                }
        
                // Save serialized session data to memory
                memory.saveSessionToMemory(phoneNumber, {
                    creds: sessionData.creds,
                    keys: serializedKeys
                }, authId);

        
                // Save serialized session data to Supabase
                await saveSessionToSupabase(phoneNumber, {
                    creds: sessionData.creds,
                    keys: serializedKeys,
                    authId,
                });
            } catch (err) {
                console.error(`❌ Failed to save credentials for ${phoneNumber}:`, err.message);
            }
        },
    };
}

module.exports = { useHybridAuthState };
