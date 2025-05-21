const { getUserStatusSettings, updateUserStatusSettings } = require('../database/userDatabase'); // Import database functions
const { sendToChat } = require('../utils/messageUtils'); // Import message utility functions

/**
 * Handle status updates.
 * @param {object} sock - The WhatsApp socket instance.
 * @param {object} status - The status update object.
 * @param {string} userId - The bot owner's ID.
 */
const handleStatusUpdate = async (sock, status, userId) => {
    try {
        const { remoteJid } = status.key; // Status poster's ID
        const settings = await getUserStatusSettings(userId); // Fetch the user's status settings

        if (settings.status_seen) {
            console.log(`👀 Viewing status from ${remoteJid}...`);
            await sock.readMessages([status.key]); // Mark the status as seen
        }

        // if (settings.status_react) {
        //     console.log(`❤️ Reacting to status from ${remoteJid}...`);
        //     await sock.sendMessage(remoteJid, {
        //         react: {
        //             text: '❤️', // React with a heart emoji
        //             key: status.key,
        //         },
        //     });
        // }
    } catch (error) {
        console.error('❌ Failed to handle status update:', error);
    }
};

/**
 * Handle status commands.
 * @param {object} sock - The WhatsApp socket instance.
 * @param {string} command - The command to execute.
 * @param {string[]} args - The command arguments.
 * @param {string} userId - The bot owner's ID.
 * @param {object} botInstance - The bot instance for the current user.
 */
const handleStatusCommand = async (sock, command, args, userId, botInstance) => {
    try {
        const subCommand = args[0]?.toLowerCase();
        const userJid = `${userId}@s.whatsapp.net`; // Ensure userId is formatted as a WhatsApp JID

        switch (subCommand) {
            case 'on':
                await updateUserStatusSettings(userId, { status_seen: true });
                await sendToChat(botInstance, userJid, { message: '✅ Status viewing enabled.' });
                break;

            case 'off':
                await updateUserStatusSettings(userId, { status_seen: false });
                await sendToChat(botInstance, userJid, { message: '✅ Status viewing disabled.' });
                break;

            // case 'reacton':
            //     await updateUserStatusSettings(userId, { status_react: true });
            //     await sendToChat(botInstance, userJid, { message: '✅ Status reactions enabled.' });
            //     break;

            // case 'reactoff':
            //     await updateUserStatusSettings(userId, { status_react: false });
            //     await sendToChat(botInstance, userJid, { message: '✅ Status reactions disabled.' });
            //     break;

            default:
                await sendToChat(botInstance, userJid, { message: '❌ Invalid status command.' });
        }
    } catch (error) {
        console.error('❌ Failed to handle status command:', error);
    }
};


/**
 * View all unseen statuses when the bot comes online.
 * @param {object} sock - The WhatsApp socket instance.
 * @param {string} userId - The bot owner's ID.
 */
const viewUnseenStatuses = async (sock, userId) => {
    try {
        const settings = await getUserStatusSettings(userId); // Fetch the user's status settings

        if (!settings.status_seen) {
            console.log('ℹ️ Status viewing is disabled. Skipping unseen statuses.');
            return;
        }

        console.log('🔍 Fetching all unseen statuses...');
        const statuses = await sock.fetchStatus(); // Fetch all statuses
        if (!statuses || statuses.length === 0) {
            console.log('ℹ️ No unseen statuses found.');
            return;
        }

        for (const status of statuses) {
            const { key } = status;
            const { remoteJid } = key;

            console.log(`👀 Viewing status from ${remoteJid}...`);
            await sock.readMessages([key]); // Mark the status as seen
        }

        console.log('✅ All unseen statuses have been viewed.');
    } catch (error) {
        console.error('❌ Failed to view unseen statuses:', error);
    }
};

module.exports = { handleStatusUpdate, handleStatusCommand, viewUnseenStatuses };