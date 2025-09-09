// Import necessary modules
import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import c from './config.js';
//const namabot = c;

// Create readline interface
const rl = readline.createInterface({ input, output });
const q = (query) => rl.question(query);

// Function to start the WhatsApp bot
async function startWhatsAppBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            /** caching makes the store faster to send/recv messages */
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
        },
        msgRetryCounterCache: undefined,
        generateHighQualityLinkPreview: true,
        // ignore all broadcast messages -- to receive the same
        // comment the line below out!
        shouldIgnoreJid: jid => jid.startsWith('broadcast'),
    });

    sock.ev.process(
        // events is a map for event name => event data
        async (events) => {
            // something about the connection changed
            // maybe it closed, or we received all offline message
            if (events['connection.update']) {
                const update = events['connection.update'];
                const { connection, lastDisconnect } = update;
                if (connection === 'close') {
                    // reconnect if not initiated by us
                    const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;

                    console.log('connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
                    if (shouldReconnect) {
                        startWhatsAppBot();
                    }
                }

                if (connection === 'open') {
                    console.log('opened connection');
                }
            }

            // if pairing code is required
            if (events['creds.update']) {
                await saveCreds();
            }

            if (events['messages.upsert']) {
                const upsert = events['messages.upsert'];
                if (upsert.type === 'notify') {
                    for (const msg of upsert.messages) {
                        if (!msg.key.fromMe && !msg.key.participant) {
                            await handleIncomingMessage(sock, msg);
                        }
                    }
                }
            }
        }
    );
    if (!state.creds?.me?.id) {
        // start a connection
        console.log('Input nomor pake 62857xxx: ');
        const phoneNumber = await q('> ');
        const code = await sock.requestPairingCode(phoneNumber);
        console.log('Pairing Code: ', code?.match(/.{1,4}/g)?.join('-') || code);
    }

}

// Function to handle incoming messages
async function handleIncomingMessage(sock, msg) {
    try {
        const sender = msg.key.remoteJid;
        const text = msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption ||
            '';
        const fromMe = msg.key.fromMe;

        if (!text) return;

        console.log(`Received message from ${sender}: ${text}`);

        // Handle commands
        if (text.startsWith('/')) {
            const command = text.slice(1).split(' ')[0].toLowerCase();
            const args = text.split(' ').slice(1);

            switch (command) {
                case 'ping':
                    await sock.sendMessage(sender, { text: 'Pong! ⚡' }, { quoted: msg });
                    break;
                case 'halo':
                    await sock.sendMessage(sender, { text: `Halo juga! 😎` }, { quoted: msg });
                    break;
                case 'info':
                    await sock.sendMessage(sender, { text: `Ini adalah base bot WhatsApp dengan Baileys.\n> Nama bot: ${c.namabot}\n> Nama owner: ${c.ownerN}` }, { quoted: msg });
    break;
                default:
                    await sock.sendMessage(sender, { text: 'Command tidak dikenali. 😅' }, { quoted: msg });
            }
        } else {
            // Auto-reply
            if (text.toLowerCase().includes('hai')) {
                await sock.sendMessage(sender, { text: 'Hai! 👋' }, { quoted: msg });
            }
        }
    } catch (error) {
        console.error("Error handling message:", error);
    }
}

// Start the bot
startWhatsAppBot().catch(console.error);
