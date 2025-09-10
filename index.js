// Import necessary modules
import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    downloadMediaMessage
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import fetch from 'node-fetch';
import c from './config.js';

const rl = readline.createInterface({ input, output });
const q = (query) => rl.question(query);

// Start WhatsApp bot
async function startWhatsAppBot() {
    const { state, saveCreds } = await useMultiFileAuthState('baseDejet');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`😥 using WA v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        msgRetryCounterCache: undefined,
        generateHighQualityLinkPreview: true,
        shouldIgnoreJid: jid => jid.startsWith('broadcast'),
    });

    sock.ev.process(async (events) => {
        if (events['connection.update']) {
            const update = events['connection.update'];
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
                if (shouldReconnect) startWhatsAppBot();
            }
            if (connection === 'open') console.log('opened connection');
        }

        if (events['creds.update']) await saveCreds();

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

        // Bisa tambahkan event lain di sini, misal group update / presence update
    });

    if (!state.creds?.me?.id) {
        console.log('😢 Input nomor pake 62857xxx: ');
        const phoneNumber = await q('> ');
        const code = await sock.requestPairingCode(phoneNumber);
        console.log('😓 Pairing Code: ', code?.match(/.{1,4}/g)?.join('-') || code);
    }
}

// Handle incoming messages & fitur
async function handleIncomingMessage(sock, msg) {
    try {
        const sender = msg.key.remoteJid;
        const text = msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption ||
            '';
        if (!text) return;

        console.log(`Received message from ${sender}: ${text}`);

        // AUTO REPLY KEYWORDS
        const greetings = ['hai', 'halo', 'helo', 'hi'];
        if (greetings.some(g => text.toLowerCase().includes(g))) {
            await sock.sendMessage(sender, { text: 'Hai juga! 👋' }, { quoted: msg });
        }

        // COMMAND HANDLER
        if (text.startsWith('/')) {
            const command = text.slice(1).split(' ')[0].toLowerCase();
            const args = text.split(' ').slice(1);

            switch (command) {
            case 'help': {
               let menu = `Hello terimaksih memggunakan dejetBase\n\n> Info-\nNama bot: ${c.namabot}\nVersi: 0.1-xcG\n { Menu nya } = \n /ping\n/helo\n/info\n/cuaca\n/sticker`
            }
           await sock.sendMessage(sender, { text: menu }, { quoted: msg });
            break
                case 'ping':
                    await sock.sendMessage(sender, { text: 'Pong! 🥲' }, { quoted: msg });
                    break;

                case 'halo':
                    await sock.sendMessage(sender, { text: `Halo juga! 😎` }, { quoted: msg });
                    break;

                case 'info':
                    await sock.sendMessage(sender, { 
                        text: `Ini adalah base bot WhatsApp dengan Baileys.\n> Nama bot: ${c.namabot}\n> Nama owner: ${c.ownerN}` 
                    }, { quoted: msg });
                    break;

                case 'cuaca':
                    try {
                        const kota = args.join(' ') || 'Jakarta';
                        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=-6.2&longitude=106.8&hourly=temperature_2m`);
                        const data = await res.json();
                        await sock.sendMessage(sender, { text: `Cuaca di ${kota}: ${data.hourly.temperature_2m[0]}°C` }, { quoted: msg });
                    } catch (err) {
                        await sock.sendMessage(sender, { text: 'Gagal ambil data cuaca 😅' }, { quoted: msg });
                    }
                    break;

                case 'sticker':
                    if (msg.message.imageMessage) {
                        const buffer = await downloadMediaMessage(msg, 'buffer', { logger: pino({ level: 'silent' }) });
                        await sock.sendMessage(sender, { sticker: { url: buffer } }, { quoted: msg });
                    } else {
                        await sock.sendMessage(sender, { text: 'Kirim gambar dulu baru ketik /sticker 😅' }, { quoted: msg });
                    }
                    break;

                default:
                    await sock.sendMessage(sender, { text: 'Command tidak dikenali. 😅' }, { quoted: msg });
            }
        }

    } catch (error) {
        console.error("Error handling message:", error);
    }
}

// Start bot
startWhatsAppBot().catch(console.error);