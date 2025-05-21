const supabase = require('../../supabaseClient');
const { BufferJSON } = require('@whiskeysockets/baileys');
const { botInstances } = require('../../utils/globalStore'); // Import botInstances to check active sessions
const memory = require('./memory');
console.log('Supabase Auth State loaded successfully ✅');

/**
 * Save session to Supabase.
 */
const saveSessionToSupabase = async (phoneNumber, sessionData) => {
    try {
        // Validate session data before saving
        if (!sessionData.creds || typeof sessionData.creds !== 'object') {
            console.warn(`⚠️ Skipping save for ${phoneNumber}: Missing or invalid creds.`);
            return;
        }

        if (!sessionData.keys || typeof sessionData.keys !== 'object') {
            console.warn(`⚠️ Skipping save for ${phoneNumber}: Missing or invalid keys.`);
            return;
        }

        if (!sessionData.authId) {
            console.warn(`⚠️ Missing authId for ${phoneNumber}. Saving anyway.`);
        }


        const serializedCreds = JSON.stringify(sessionData.creds, BufferJSON.replacer);
        const serializedKeys = {};
        for (const keyType in sessionData.keys) {
            serializedKeys[keyType] = {};
            for (const keyId in sessionData.keys[keyType]) {
                serializedKeys[keyType][keyId] = JSON.stringify(sessionData.keys[keyType][keyId], BufferJSON.replacer);
            }
        }

        const { data, error } = await supabase
            .from('sessions_two')
            .upsert({
                phoneNumber,
                authId: sessionData.authId,
                creds: serializedCreds,
                keys: JSON.stringify(serializedKeys),


            });

            if (data && data.length > 0) {
                console.log(`✅ Session saved to Supabase for ${phoneNumber}, data:`, data);
            }
            
        if (error) {
            throw new Error(error.message);
        }
    } catch (error) {
        console.error(`❌ Failed to save session to Supabase for ${phoneNumber}:`, error.message);
    }
};
/**
 * Load session from Supabase.
 */
const loadSessionFromSupabase = async (phoneNumber) => {
    try {
        const { data, error } = await supabase
            .from('sessions_two')
            .select('creds, keys')
            .eq('phoneNumber', phoneNumber)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                console.log(`⚠️ No session found for ${phoneNumber}`);
                return null;
            }
            throw new Error(error.message);
        }

        // Validate and parse creds and keys
        const creds = JSON.parse(data.creds, BufferJSON.reviver);
         const keys = typeof data.keys === 'string'
            ? JSON.parse(data.keys, BufferJSON.reviver)
            : data.keys;


        if (!creds || !keys) {
            throw new Error(`Invalid session data for ${phoneNumber}`);
        }

        console.log(`✅ Session loaded from Supabase for ${phoneNumber}`);
        return { creds, keys };
    } catch (error) {
        console.error(`❌ Could not load session for ${phoneNumber}:`, error.message);
        return null;
    }
};
/**
 * Delete session from Supabase.
 */
const deleteSessionFromSupabase = async (phoneNumber) => {
    try {
        const { data, error } = await supabase
            .from('sessions_two')
            .delete()
            .eq('phoneNumber', phoneNumber);

        if (error) {
            throw new Error(error.message);
        }

        if (data && data.length > 0) {
            console.log(`✅ Successfully deleted session for ${phoneNumber}`);
        } else {
            console.log(`⚠️ No session found for ${phoneNumber}. Nothing was deleted.`);
        }
    } catch (error) {
        console.error(`❌ Could not delete session for ${phoneNumber}:`, error.message);
    }
};

/**
 * List all session phone numbers.
 */
const listSessionsFromSupabase = async () => {
    try {
        const { data, error } = await supabase
            .from('sessions_two')
            .select('phoneNumber, authId');

        if (error) {
            throw new Error(error.message);
        }

        if (!data || data.length === 0) {
            console.log('⚠️ No sessions found in Supabase.');
            return [];
        }

        console.log('🔍 Sessions fetched from Supabase:', data);
        return data.map((session) => ({
            phoneNumber: session.phoneNumber || 'Unknown',
            authId: session.authId || null,
            active: !!botInstances[session.phoneNumber], // Check if the user is active
        }));
    } catch (error) {
        console.error('❌ Could not list sessions:', error.message);
        return [];
    }
};

/**
 * Sync all in-memory sessions to Supabase.
 */
const syncMemoryToSupabase = async () => {
    try {
        const sessions = memory.getAllSessionsFromMemory();
        for (const session of sessions) {
            if (!session.phoneNumber) {
                console.warn('⚠️ Skipping session with undefined phone number.');
                continue;
            }
            await saveSessionToSupabase(session.phoneNumber, session);
        }
        console.log(`✅ Synced ${sessions.length} sessions from memory to Supabase.`);
    } catch (error) {
        console.error('❌ Failed to sync memory to Supabase:', error.message);
    }
};

/**
 * Load all sessions from Supabase into memory.
 */
const loadAllSessionsFromSupabase = async () => {
    try {
        const { data, error } = await supabase.from('sessions_two').select('*');
        if (error) throw new Error(error.message);

       const validSessions = data
    .map((session) => {
        try {
            if (!session.phoneNumber || !session.creds || !session.keys) {
                console.warn('⚠️ Skipping invalid session from Supabase:', session);
                return null;
            }

            const creds = JSON.parse(session.creds, BufferJSON.reviver);
            const keys = JSON.parse(session.keys, BufferJSON.reviver);

            return {
                phoneNumber: session.phoneNumber,
                authId: session.authId,
                creds,
                keys,
            };
        } catch (err) {
            console.warn(`⚠️ Skipping session with invalid JSON for ${session.phoneNumber}:`, err.message);
            return null;
        }
    })
    .filter(Boolean);


        memory.loadSessionsToMemory(validSessions);
        console.log(`✅ Loaded ${validSessions.length} valid sessions into memory.`);
    } catch (error) {
        console.error('❌ Failed to load sessions from Supabase:', error.message);
    }
};
module.exports = {
    saveSessionToSupabase,
    loadSessionFromSupabase,
    deleteSessionFromSupabase,
    listSessionsFromSupabase,
    syncMemoryToSupabase,
    loadAllSessionsFromSupabase,
};