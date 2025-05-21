const { getEmojiForCommand } = require('./emojiReaction');


/**
 * Centralized function to send messages to a chat.
 * @param {object} botInstance - The bot instance to send the message through.
 * @param {string} chatId - The chat ID to send the message to.
 * @param {object} options - Options for sending the message.
 * @param {string} [options.message] - The message text to send.
 * @param {array} [options.mentions] - Optional mentions in the message.
 * @param {Buffer} [options.media] - The media content to send (image, video, audio, document, or voice note).
 * @param {string} [options.caption] - The caption for the media message.
 * @param {string} [options.mediaType] - The type of media (image, video, audio, document, or voice note).
 * @param {object} [options.quotedMessage] - The message to quote.
 */
const sendToChat = async (botInstance, chatId, options = {}) => {
    const { message, mentions = [], media, caption, mediaType, quotedMessage } = options;

    try {
        console.log(`🔍 Debugging "chatId" value:`, chatId);
        console.log(`🔍 Debugging "message" value:`, message);
        console.log(`🔍 Debugging "media" value:`, media);

        // Ensure botInstance is valid
        if (!botInstance || typeof botInstance.sendMessage !== 'function') {
            throw new TypeError('Invalid botInstance: sendMessage is not a function.');
        }

        // Ensure chatId is valid
        if (!chatId || (!chatId.endsWith('@s.whatsapp.net') && !chatId.endsWith('@g.us'))) {
            throw new Error(`Invalid chatId: "${chatId}". Expected a valid WhatsApp JID.`);
        }

        // Ensure at least one of "message" or "media" is provided
        if (!message && !media) {
            throw new Error('Either "message" or "media" must be provided to sendToChat.');
        }

        // Handle media messages
        if (media) {
            const resolvedMediaType = mediaType || (media && 'image');
            if (!['image', 'video', 'audio', 'document', 'voice'].includes(resolvedMediaType)) {
                throw new Error('Invalid media type. Expected "image", "video", "audio", "document", or "voice".');
            }

            const mediaPayload = {
                [resolvedMediaType]: media,
                caption: caption || '',
                mentions,
            };

            if (resolvedMediaType === 'audio' || resolvedMediaType === 'voice') {
                mediaPayload.ptt = resolvedMediaType === 'voice';
            }

            if (quotedMessage) {
                mediaPayload.quoted = quotedMessage;
            }

            await botInstance.sendMessage(chatId, mediaPayload);
            console.log(`✅ Media message sent to ${chatId} with caption: ${caption}`);
            return;
        }

        // Handle text messages
        if (message) {
            if (typeof message !== 'string') {
                throw new TypeError(`Expected "message" to be a string, but got ${typeof message}`);
            }

            const textPayload = { text: message, mentions };
            if (quotedMessage) {
                textPayload.quoted = quotedMessage;
            }

            await botInstance.sendMessage(chatId, textPayload);
            console.log(`✅ Message sent to ${chatId}: ${message}`);
        }
    } catch (error) {
        console.error(`❌ Error sending message to ${chatId}:`, error);
    }
};
/**
 * Send a reaction to a specific message.
 * @param {object} botInstance - The bot instance to send the reaction through.
 * @param {string} chatId - The chat ID where the message is located.
 * @param {string} messageId - The ID of the message to react to.
 * @param {string} command - The command name to determine the emoji.
 */
const sendReaction = async (botInstance, chatId, messageId, command) => {
    try {
        const emoji = getEmojiForCommand(command); // Get the emoji for the command
        console.log(`🔍 Determined emoji for command "${command}": ${emoji}`); // Log the emoji

        await botInstance.sendMessage(chatId, {
            react: {
                text: emoji,
                key: { id: messageId, remoteJid: chatId },
            },
        });
        console.log(`✅ Reaction "${emoji}" sent to message ${messageId} in ${chatId}`);
    } catch (error) {
        console.error(`❌ Error sending reaction to message ${messageId} in ${chatId}:`, error);
    }
};

module.exports = { sendToChat, sendReaction };