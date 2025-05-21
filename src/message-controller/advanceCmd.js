const handleAdvanceCommand = async (sock, message, command, args, userId, remoteJid, botInstance) => {
    try {
        switch (command) {
            case 'upload': {
                // If replying to an image
                if (message.message?.imageMessage) {
                    // Download the image
                    const stream = await sock.downloadMediaMessage(message);
                    let imageBuffer = Buffer.from([]);
                    for await (const chunk of stream) imageBuffer = Buffer.concat([imageBuffer, chunk]);
                    // Use caption if available
                    const caption = message.message.imageMessage.caption || '';
                    // Upload to status
                    await sock.sendMessage(userId + '@s.whatsapp.net', {
                        image: imageBuffer,
                        caption: caption
                    }, { statusJid: 'status@broadcast' });
                    await sendToChat(botInstance, remoteJid, {
                        message: '✅ Image uploaded to your status!',
                        quotedMessage: message
                    });
                    return true;
                }
                // If text is provided
                const text = args.join(' ');
                if (text) {
                    await sock.sendMessage(userId + '@s.whatsapp.net', {
                        text: text
                    }, { statusJid: 'status@broadcast' });
                    await sendToChat(botInstance, remoteJid, {
                        message: '✅ Text uploaded to your status!',
                        quotedMessage: message
                    });
                    return true;
                }
                // If neither image nor text
                await sendToChat(botInstance, remoteJid, {
                    message: '❌ Reply to an image or provide text to upload to your status.',
                    quotedMessage: message
                });
                return true;
            }
            default:
                return false;
        }
    } catch (error) {
        await sendToChat(botInstance, remoteJid, {
            message: '❌ Failed to upload to status.',
            quotedMessage: message
        });
        return true;
    }
};

module.exports = handleAdvanceCommand;