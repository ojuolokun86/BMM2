const handleMessage = require('../message-controller/msgHandler'); // Import the message handler
const { handleNewUserJoin } = require('../utils/groupUser'); // Import the function to handle new user joins
const { botInstances, intentionalRestarts } = require('../utils/globalStore'); // Import the global botInstances object
const { viewUnseenStatuses } = require('../message-controller/statusView'); // Import the function
const { getUserId } = require('../utils/auth'); // Import the function to get user ID
const { updateUserMetrics } = require('../database/models/metrics'); // Import the user metrics functions
const { addActivityLog, addAnalyticsData } = require('../server/info'); // Import addActivityLog
const fs = require('fs');
const path = require('path');
const { auth } = require('../supabaseClient');
const { getUser } = require('../database/userDatabase'); // Import the user database functions
const { startNewSession } = require('../users/userSession'); // Import the function to start a new session

const userQueues = new Map(); // Map to store per-user/group queues

/**
 * Add a task to the queue for a given key (user or group).
 * @param {string} queueKey - The key for the queue (userId or group JID).
 * @param {Function} task - The async function to execute.
 */
const addToQueue = (queueKey, task) => {
    if (typeof task !== 'function') {
        console.error(`❌ Invalid task for queueKey ${queueKey}. Task must be a function.`);
        return;
    }

    if (!userQueues.has(queueKey)) {
        userQueues.set(queueKey, []);
    }

    const queue = userQueues.get(queueKey);
    queue.push(task);

    if (queue.length === 1) {
        processQueue(queueKey);
    }
};


/**
 * Process the queue for a given key.
 * @param {string} queueKey - The key for the queue (userId or group JID).
 */
const processQueue = async (queueKey) => {
    const queue = userQueues.get(queueKey);
    while (queue && queue.length > 0) {
        const task = queue[0];
        let userId, authId;
        const startTime = Date.now();
        try {
            // If your task returns userId/authId, capture them here
            ({ userId, authId } = await task());
        } catch (error) {
            console.error(`❌ Error processing task for queueKey ${queueKey}:`, error);
        }
        const endTime = Date.now();
        const timeTaken = endTime - startTime;

        // Only update metrics if userId and authId are available
        if (userId && authId) {
            updateUserMetrics(userId, authId, { queueProcessingTime: timeTaken });
            console.log(`⏱️ Task for user ${userId} and authId ${authId} took ${timeTaken}ms to complete.`);
        }

        queue.shift();
    }
    if (queue && queue.length === 0) {
        userQueues.delete(queueKey);
    }
};





// const processQueue = async (userId) => {
//     const queue = userQueues.get(userId); // Retrieve the user's queue
//     const user = await getUser(userId); // Fetch the user object

//     if (!user) {
//         console.error(`❌ Failed to fetch user for userId: ${userId}`);
//         return;
//     }

//     const authId = user.auth_id; // Extract authId from the user object
    
//     if (!authId) {
//         console.error(`❌ authId is undefined for user ${userId}`);
//         return;
//     }

//     while (queue && queue.length > 0) {
//         const task = queue[0]; // Get the first task in the queue

//         const startTime = Date.now(); // Start timing the task
//         try {
//             await task(); // Execute the task (process the message)
//         } catch (error) {
//             console.error(`❌ Error processing task for user ${userId}:`, error);
//         }
//         const endTime = Date.now(); // End timing the task
//         const timeTaken = endTime - startTime;

//         // Save the time delay for the user
//         updateUserMetrics(userId, authId, { queueProcessingTime: timeTaken });

//         console.log(`⏱️ Task for user ${userId} and authId ${authId} took ${timeTaken}ms to complete.`);

//         queue.shift(); // Remove the processed task from the queue
//     }

//     // Remove the queue if it's empty
//     if (queue && queue.length === 0) {
//         userQueues.delete(userId);
//     }
// };

function extractMessageContent(message) {
    if (!message || !message.message) return '';
    const msg = message.message;

    // Handle ephemeral message wrapper
    if (msg.ephemeralMessage?.message) {
        return extractMessageContent({ message: msg.ephemeralMessage.message });
    }

    // Handle view-once wrapper
    if (msg.viewOnceMessage?.message) {
        return extractMessageContent({ message: msg.viewOnceMessage.message });
    }

    if (msg.conversation) return msg.conversation;
    if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
    if (msg.imageMessage?.caption) return msg.imageMessage.caption;
    if (msg.videoMessage?.caption) return msg.videoMessage.caption;
    if (msg.documentMessage?.caption) return msg.documentMessage.caption;
    if (msg.audioMessage?.caption) return msg.audioMessage.caption;
    if (msg.voiceMessage?.duration) return `🎤 Voice message: ${msg.voiceMessage.duration} seconds`;
    if (msg.gifMessage?.url) return `🎞️ GIF: ${msg.gifMessage.url}`;
    if (msg.stickerMessage?.fileSha256) return '📄 Sticker received';

    if (msg.buttonsResponseMessage?.selectedButtonId) return msg.buttonsResponseMessage.selectedButtonId;
    if (msg.listResponseMessage?.title) return msg.listResponseMessage.title;
    if (msg.templateButtonReplyMessage?.selectedId) return msg.templateButtonReplyMessage.selectedId;

    if (msg.contactMessage?.displayName) return msg.contactMessage.displayName;
    if (msg.contactMessage?.contact?.name) return `📇 Contact: ${msg.contactMessage.contact.name}`;
    if (msg.contactsArrayMessage?.contacts?.[0]?.displayName) return msg.contactsArrayMessage.contacts[0].displayName;

    if (msg.locationMessage?.name) return msg.locationMessage.name;
    if (msg.liveLocationMessage?.name) return msg.liveLocationMessage.name;

    if (msg.callMessage?.callId) return `📞 Call from ${msg.callMessage.callId}`;
    if (msg.reactionMessage?.text) return `❤️ Reacted: ${msg.reactionMessage.text}`;
    if (msg.potentiallyMobileDeviceMessage?.text) return msg.potentiallyMobileDeviceMessage.text;
    if (msg.pollUpdateMessage?.pollUpdates) return '📊 Poll response received';
    if (msg.pollCreationMessage?.name) return `📊 Poll created: ${msg.pollCreationMessage.name}`;
    if (msg.protocolMessage?.type === 3) return '🗑️ Message deleted';
    if (msg.protocolMessage?.type === 17) return '';
    if (msg.protocolMessage?.type === 3) return '🗑️ Message deleted';
    if (msg.protocolMessage?.type === 14) return '⭐ Message kept in chat';
    if (msg.protocolMessage?.type === 15) return '⭐ Message unkept in chat';
    if (msg.protocolMessage?.type === 17) return ''; // Peer data op, ignore
    if (msg.protocolMessage?.type === 25) return '✏️ Message edited';
    if (msg.groupInviteMessage?.groupName) return `📩 Group Invite: ${msg.groupInviteMessage.groupName}`;

    if (msg.paymentMessage?.amount) {
        const amount = msg.paymentMessage.amount;
        return `💰 Payment of ${amount.currency} ${amount.amount} received`;
    }

    if (msg.orderMessage?.title) return `🛍️ Order: ${msg.orderMessage.title}`;
    if (msg.documentMessage?.fileName) return `📄 Document: ${msg.documentMessage.fileName}`;

    // Handle quoted messages
    const quoted = msg?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted) {
        const quotedContent = extractMessageContent({ message: quoted });
        if (quotedContent) return `🗨️ Quoted: ${quotedContent}`;
    }

    console.log(`👁️ Unhandled message type for message ID ${message.key?.id}:`, msg);
    return '';
}




module.exports = async (sock, userId, version) => {
    console.log(`🤖🤖 Initializing bot instance for user: ${userId} with WhatsApp Web version: ${version}`);
    const user = await getUser(userId); // Get the user object for the user
    console.lo
    
        if (!user) {
            console.error(`❌ User with userId ${userId} not found in the database.`);
            return; // Exit early if the user does not exist
        }
    
    const authId = user.auth_id; // Extract authId from the user object
    console.log(`🤖🤖 Initializing bot instance for user: ${userId} with authId: ${authId}`);

    if (!sock || !sock.ev) {
        console.error(`❌ Invalid sock object for user: ${userId}`);
        return;
    }

    botInstances[userId] = sock; // Store the socket in the global botInstances object
    if (!botInstances[userId]) {
        console.error(`❌ Invalid botInstance for user: ${userId}. Expected a valid WhatsApp socket instance.`);
        return;
    }

    console.log(`🤖🤖 Bot instance initialized for user: ${userId} using WhatsApp Web version: ${version}`);
    // Listen for incoming messages
    sock.ev.on('messages.upsert', async (messageUpdate) => {
        console.log(`📥 New message received for user: ${userId}`);
        const message = messageUpdate.messages[0];
        const messageContent = extractMessageContent(message); // Message content
        const remoteJid = message.key.remoteJid; // Chat ID (e.g., group or individual chat)
        const sender = message.key.participant || remoteJid; // Sender's ID (for group chats, use participant)
        const normalizedSender = sender.split('@')[0]; // Normalize sender's number
        const isFromMe = message.key.fromMe; // Whether the message is from the bot itself
        const isGroup = remoteJid.endsWith('@g.us'); // Check if the message is from a group
        const messageId = message.key.id; // Unique message ID
        const messageType = Object.keys(message.message?.viewOnceMessage?.message || {})[0]; // Get the type of the media
        // Correctly identify the sender and receiver in DMs
        const realSender = isGroup ? normalizedSender : (isFromMe ? userId : normalizedSender);
        const realReceiver = isGroup ? remoteJid : userId;
        console.log(`📥 Message from
             ${realSender}
              to ${realReceiver}
               in ${isGroup ? 'group' : 
                'DM'}: ${messageContent}`);

      // Add the message to the user's queue
      const queueKey = isGroup ? remoteJid : userId;
      addToQueue(queueKey, async () => {
    const startTime = Date.now();

    console.log(`[${new Date().toISOString()}] ⏳ Start processing message for ${userId}`);

    // 1. Presence update (available)
    const t1 = Date.now();
    try {
        await sock.sendPresenceUpdate('available', remoteJid);
    } catch (err) {}
    console.log(`[${new Date().toISOString()}] ⏱️ Presence available took ${Date.now() - t1}ms`);

    // 2. Assert session
    // const t2 = Date.now();
    // try {
    //     await sock.assertSessions([remoteJid]);
    //     console.log('📩 aseert sucessful')
    // } catch (err) {}
    // console.log(`[${new Date().toISOString()}] ⏱️ Assert session took ${Date.now() - t2}ms`);

    // 3. Handle message
    const t3 = Date.now();
    try {
        await handleMessage(sock, message, userId, authId);
        console.log(`[${new Date().toISOString()}] ✅ handleMessage completed`);
    } catch (err) {
        console.error(`[${new Date().toISOString()}] ❌ handleMessage error:`, err);
    } finally {
        // 4. Presence update (unavailable) - always runs
        const t4 = Date.now();
        try {
            await sock.sendPresenceUpdate('unavailable', remoteJid);
        } catch (err) {}
        console.log(`[${new Date().toISOString()}] ⏱️ Presence unavailable took ${Date.now() - t4}ms`);

        const endTime = Date.now();
        console.log(`[${new Date().toISOString()}] ✅ Total processing time: ${endTime - startTime}ms`);
    
    }
    return{ userId, authId };
});
    });

    // Listen for group participant updates
    sock.ev.on('group-participants.update', async (update) => {
        const { id: groupId, participants, action } = update;

        if (action === 'add') {
            console.log(`🔍 New participants added to group ${groupId}:`, participants);

            for (const userJid of participants) {
                console.log(`👤 Handling new user join: ${userJid}`);
                await handleNewUserJoin(sock, groupId, userJid, botInstances[userId]);
            }
        } else if (action === 'remove') {
            console.log(`👋 Participants removed from group ${groupId}:`, participants);
            // Handle user removal if needed
        }
    });
};