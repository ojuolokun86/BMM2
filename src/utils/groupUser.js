const { getWelcomeSettings } = require('../database/welcome'); // Import welcome settings functions
const { sendToChat } = require('../utils/messageUtils'); // Import sendToChat for sending messages

/**
 * Handle a new user joining a group.
 * @param {object} sock - The WhatsApp socket instance.
 * @param {string} groupId - The group ID.
 * @param {string} userJid - The new user's JID.
 * @param {object} botInstance - The bot instance for the current user.
 * @returns {Promise<void>}
 */
const handleNewUserJoin = async (sock, groupId, userJid, botInstance) => {
    try {
        // Fetch welcome settings for the group and bot instance
        const settings = await getWelcomeSettings(groupId, botInstance.user.id);

        // Log the fetched settings
        console.log(`🔍 Welcome settings for group ${groupId} and bot instance ${botInstance.user.id}:`, settings);

        if (!settings.is_enabled) {
            console.log(`ℹ️ Welcome messages are disabled for group ${groupId} and bot instance ${botInstance.user.id}.`);
            return;
        }

        // Fetch group metadata for default welcome message
        const groupMetadata = await sock.groupMetadata(groupId);
        const groupName = groupMetadata.subject;

        // Determine the welcome message
        let welcomeMessage = settings.welcome_message;
        if (!welcomeMessage) {
            welcomeMessage = `Welcome to ${groupName}!`; // Default message using group info
        }

        // Construct the message with user mention
        const message = `${welcomeMessage}\n@${userJid.split('@')[0]}`;

        // Send the welcome message using sendToChat
        await sendToChat(botInstance, groupId, {
            message, // Ensure the message is passed correctly
            mentions: [userJid],
        });

        console.log(`✅ Sent welcome message to ${userJid} in group ${groupId} for bot instance ${botInstance.user.id}.`);
    } catch (error) {
        console.error(`❌ Failed to send welcome message to ${userJid} in group ${groupId}:`, error);
    }
};

module.exports = {
    handleNewUserJoin,
};