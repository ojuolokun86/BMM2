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

         // Guard clause to check botInstance and user ID
        if (!botInstance || !botInstance.user || !botInstance.user.id) {
            console.error(`❌ Bot instance or user ID is undefined for group ${groupId}, user ${userJid}.`);
            return;
        }
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
        const groupDesc = groupMetadata.desc || "No description provided.";

        // Determine the welcome message
        let welcomeMessage = settings.welcome_message;
        if (!welcomeMessage) {
            welcomeMessage = `🤖 *Techitoon Bot*\n\n📢 Welcome to *${groupName}*, @${userJid.split('@')[0]}!\n\nWe're excited to have you onboard. Please take a moment to review the group rules and description below to ensure a great experience for everyone.\n\n📄 *Group Description:*\n${groupDesc}\n\nIf you have any questions or need assistance, feel free to ask. Let's make this group engaging and productive! 🚀`;
        }

        // Send the welcome message
        await sendToChat(botInstance, groupId, {
            message: welcomeMessage,
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