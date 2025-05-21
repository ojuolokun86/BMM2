// const { makeWASocket: makeWASocketWAJS, useMultiFileAuthState: useMultiFileAuthStateWAJS } = require('@adiwajshing/baileys');
// const { makeWASocket: makeWASocketWhiskey, useMultiFileAuthState: useMultiFileAuthStateWhiskey } = require('@whiskeysockets/baileys');

// /**
//  * Dynamically initialize a session.
//  * @param {string} library - The library to use ('wajs' or 'whiskeysockets').
//  * @param {string} sessionPath - The path to the session folder.
//  * @returns {object} - The initialized socket and state.
//  */
// const initializeSession = async (library, sessionPath) => {
//     try {
//         if (library === 'wajs') {
//             const { state, saveCreds } = await useMultiFileAuthStateWAJS(sessionPath);
//             const sock = makeWASocketWAJS({
//                 version: await fetchWhatsAppWebVersion('wajs'),
//                 auth: state,
//             });
//             return { sock, saveCreds };
//         } else if (library === 'whiskeysockets') {
//             const { state, saveCreds } = await useMultiFileAuthStateWhiskey(sessionPath);
//             const sock = makeWASocketWhiskey({
//                 version: await fetchWhatsAppWebVersion('whiskeysockets'),
//                 auth: state,
//             });
//             return { sock, saveCreds };
//         } else {
//             throw new Error(`Unknown library: ${library}`);
//         }
//     } catch (error) {
//         console.error(`❌ Failed to initialize session with ${library}:`, error);
//         throw error;
//     }
// };

// module.exports = { initializeSession };