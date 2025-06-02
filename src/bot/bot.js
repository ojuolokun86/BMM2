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

const userQueues = new Map(); // Map to store per-user queues

const addToQueue = (userId, task) => {
    if (typeof task !== 'function') {
        console.error(`❌ Invalid task for user ${userId}. Task must be a function.`);
        return;
    }

    if (!userQueues.has(userId)) {
        userQueues.set(userId, []); // Initialize the queue as an empty array
    }

    const queue = userQueues.get(userId); // Retrieve the user's queue
    queue.push(task); // Add the task to the queue

    // If the queue is not already being processed, start processing it
    if (queue.length === 1) {
        processQueue(userId); // Start processing the queue
    }
};

const processQueue = async (userId) => {
    const queue = userQueues.get(userId); // Retrieve the user's queue
    const user = await getUser(userId); // Fetch the user object

    if (!user) {
        console.error(`❌ Failed to fetch user for userId: ${userId}`);
        return;
    }

    const authId = user.auth_id; // Extract authId from the user object
    
    if (!authId) {
        console.error(`❌ authId is undefined for user ${userId}`);
        return;
    }

    while (queue && queue.length > 0) {
        const task = queue[0]; // Get the first task in the queue

        const startTime = Date.now(); // Start timing the task
        try {
            await task(); // Execute the task (process the message)
        } catch (error) {
            console.error(`❌ Error processing task for user ${userId}:`, error);
        }
        const endTime = Date.now(); // End timing the task
        const timeTaken = endTime - startTime;

        // Save the time delay for the user
        updateUserMetrics(userId, authId, { queueProcessingTime: timeTaken });

        console.log(`⏱️ Task for user ${userId} and authId ${authId} took ${timeTaken}ms to complete.`);

        queue.shift(); // Remove the processed task from the queue
    }

    // Remove the queue if it's empty
    if (queue && queue.length === 0) {
        userQueues.delete(userId);
    }
};

module.exports = async (sock, userId, version) => {
    const user = await getUser(userId); // Get the user object for the user
    
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
     // --- Watchdog setup ---
    let lastEventTime = Date.now();
    const WATCHDOG_TIMEOUT = 10 * 60 * 1000; // 10 minutes
    const phoneNumber = userId; // Use userId as the phone number

    // Watchdog interval: checks every minute
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


    // Listen for incoming messages
    sock.ev.on('messages.upsert', async (messageUpdate) => {
         lastEventTime = Date.now();
        const message = messageUpdate.messages[0];
        const remoteJid = message.key.remoteJid; // Chat ID (e.g., group or individual chat)
        const sender = message.key.participant || remoteJid; // Sender's ID (for group chats, use participant)
        const normalizedSender = sender.split('@')[0]; // Normalize sender's number
        const isFromMe = message.key.fromMe; // Whether the message is from the bot itself
        const isGroup = remoteJid.endsWith('@g.us'); // Check if the message is from a group
        const messageId = message.key.id; // Unique message ID
        const messageContent = message.message?.conversation || message.message?.extendedTextMessage?.text || ''; // Message content
        const messageType = Object.keys(message.message?.viewOnceMessage?.message || {})[0]; // Get the type of the media
        // Correctly identify the sender and receiver in DMs
        const realSender = isGroup ? normalizedSender : (isFromMe ? userId : normalizedSender);
        const realReceiver = isGroup ? remoteJid : userId;

      // Add the message to the user's queue
      addToQueue(userId, async () => {
         const startTime = Date.now(); // Start timing the task
  // Log the activity
            if (!authId) {
                console.error(`❌ authId is undefined for user ${userId}`);
            } else {
                addActivityLog(authId, {
                    timestamp: new Date().toISOString(),
                    action: `Processed message: "${messageContent}"`,
                });
            }
    // Pass the message to the message handler
    await handleMessage(sock, message, userId, authId);

    const endTime = Date.now(); // End timing the task
    const processingTime = endTime - startTime;

     // Add analytics data
            if (!authId) {
                console.error(`❌ authId is undefined for user ${userId}`);
            } else {
                console.log(`🔍 Adding analytics data for authId: ${authId}`);
                addAnalyticsData(authId, {
                    timestamp: new Date().toISOString(),
                    commandProcessingTime: processingTime,
                });
            }
        });
    });

    // Listen for group participant updates
    sock.ev.on('group-participants.update', async (update) => {
         lastEventTime = Date.now();
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