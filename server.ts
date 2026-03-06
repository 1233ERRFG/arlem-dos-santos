import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import makeWASocket, { 
    DisconnectReason, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { GoogleGenAI } from '@google/genai';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const PORT = 3000;

app.use(express.json());

// Socket.io connection handler
io.on('connection', (socket) => {
    console.log('New client connected');
    if (lastQR) socket.emit('qr', lastQR);
    socket.emit('status', sock?.user ? 'connected' : (lastQR ? 'disconnected' : 'connecting'));
});

// Database Setup
const db = new Database('database.sqlite');
db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        remoteJid TEXT,
        pushName TEXT,
        text TEXT,
        fromMe INTEGER,
        timestamp INTEGER
    );
    CREATE TABLE IF NOT EXISTS leads (
        remoteJid TEXT PRIMARY KEY,
        name TEXT,
        lastInteraction INTEGER
    );
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );
`);

// Initialize default settings
const initSettings = () => {
    const defaults = [
        ['system_instruction', 'Você é um assistente de vendas especializado e carismático para a "ZapFlow Solutions".\nSeu objetivo é guiar o cliente através de um funil de vendas de forma natural.\n\nFluxo do Funil:\n1. Saudação inicial e identificação da necessidade.\n2. Apresentação dos planos: \n   - Plano Start: R$ 97/mês (Automação básica)\n   - Plano Pro: R$ 197/mês (IA Ilimitada + Dashboard)\n   - Plano Enterprise: R$ 497/mês (Suporte dedicado + Integrações)\n3. Coleta de dados (Nome e qual plano interessa).\n4. Instruções de pagamento: Informe que aceitamos PIX e Cartão. Para finalizar, ele deve confirmar o interesse.\n5. Fechamento: Agradeça e diga que um consultor humano entrará em contato se necessário.\n\nRegras:\n- Seja breve e use emojis.\n- Nunca saia do personagem.\n- Se o cliente perguntar algo fora do escopo, gentilmente traga-o de volta ao funil.\n- Use o nome do cliente se ele fornecer.'],
        ['model', 'gemini-3-flash-preview'],
        ['temperature', '0.7'],
        ['ignore_groups', 'true'],
        ['ignore_calls', 'true'],
        ['auto_read', 'true'],
        ['ignore_status', 'true']
    ];
    const stmt = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
    for (const [key, val] of defaults) {
        stmt.run(key, val);
    }
};
initSettings();

// AI Setup
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function getAIResponse(chatHistory: string, userMessage: string) {
    try {
        const systemInstruction = db.prepare("SELECT value FROM settings WHERE key = 'system_instruction'").get() as any;
        const modelName = db.prepare("SELECT value FROM settings WHERE key = 'model'").get() as any;
        const temperature = db.prepare("SELECT value FROM settings WHERE key = 'temperature'").get() as any;

        console.log(`AI Request - Model: ${modelName?.value}, Temp: ${temperature?.value}`);
        console.log(`System Instruction Length: ${systemInstruction?.value?.length || 0}`);

        const result = await ai.models.generateContent({
            model: modelName?.value || "gemini-3-flash-preview",
            contents: [
                { 
                    role: "user", 
                    parts: [{ text: `INSTRUÇÕES OBRIGATÓRIAS DO SISTEMA:\n${systemInstruction?.value || "Você é um assistente prestativo."}\n\n--- HISTÓRICO RECENTE ---\n${chatHistory}\n\n--- MENSAGEM ATUAL DO CLIENTE ---\n${userMessage}\n\nResponda agora seguindo RIGOROSAMENTE as instruções acima.` }] 
                }
            ],
            config: {
                temperature: parseFloat(temperature?.value || "0.7"),
                topP: 0.95,
                topK: 40
            }
        });
        return result.text || "Desculpe, tive um problema técnico. Pode repetir?";
    } catch (error: any) {
        console.error("AI Error:", error);
        return "Estou processando muitas mensagens agora. Pode me chamar em instantes?";
    }
}

// API Routes
app.get('/api/stats', (req, res) => {
    const totalMessages = db.prepare("SELECT COUNT(*) as count FROM messages").get() as any;
    const totalLeads = db.prepare("SELECT COUNT(*) as count FROM leads").get() as any;
    const recentMessages = db.prepare("SELECT * FROM messages ORDER BY timestamp DESC LIMIT 10").all();
    res.json({
        totalMessages: totalMessages.count,
        totalLeads: totalLeads.count,
        recentMessages
    });
});

app.get('/api/settings', (req, res) => {
    const settings = db.prepare("SELECT * FROM settings").all() as any[];
    const settingsObj = settings.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {});
    res.json(settingsObj);
});

app.post('/api/settings', (req, res) => {
    try {
        const settings = req.body;
        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ error: 'Invalid settings object' });
        }

        const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
        const transaction = db.transaction((data) => {
            for (const [key, value] of Object.entries(data)) {
                if (value !== undefined && value !== null) {
                    stmt.run(key, String(value));
                }
            }
        });

        transaction(settings);
        res.json({ status: 'ok' });
    } catch (e) {
        console.error('Settings save error:', e);
        res.status(500).json({ error: String(e) });
    }
});

app.post('/api/clear-history', (req, res) => {
    try {
        db.prepare("DELETE FROM messages").run();
        res.json({ status: 'ok' });
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

app.post('/api/reset', (req, res) => {
    try {
        console.log('Resetting WhatsApp session...');
        const authPath = path.join(process.cwd(), 'auth_info_baileys');
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
        }
        res.json({ status: 'ok' });
        setTimeout(() => process.exit(0), 1000);
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

// WhatsApp Logic
let sock: any;
let lastQR: string | null = null;

const connectToWhatsApp = async () => {
    console.log('Starting WhatsApp connection...');
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    let version: [number, number, number] = [2, 3000, 1015901307];
    try {
        console.log('Fetching latest Baileys version...');
        const latest = await Promise.race([
            fetchLatestBaileysVersion(),
            new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
        ]);
        if (latest) {
            version = latest.version;
            console.log(`Using latest Baileys version ${version}`);
        }
    } catch (e) {
        console.log('Using fallback version due to error:', e instanceof Error ? e.message : e);
    }

    sock = makeWASocket({
        version,
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        logger: pino({ level: 'silent' }),
        browser: ['ZapFlow AI', 'Chrome', '1.0.0'],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;
        console.log('Connection update:', { connection, hasQr: !!qr });
        
        if (qr) {
            console.log('New QR code received');
            lastQR = await qrcode.toDataURL(qr);
            io.emit('qr', lastQR);
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting:', shouldReconnect);
            io.emit('status', 'disconnected');
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('WhatsApp connection opened successfully');
            lastQR = null;
            io.emit('status', 'connected');
        }
    });

    sock.ev.on('messages.upsert', async (m: any) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const remoteJid = msg.key.remoteJid;
        const pushName = msg.pushName || 'Cliente';
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        if (!text) return;

        console.log(`New message from ${pushName}: ${text}`);

        // Check settings
        const ignoreGroups = db.prepare("SELECT value FROM settings WHERE key = 'ignore_groups'").get() as any;
        if (ignoreGroups?.value === 'true' && remoteJid.endsWith('@g.us')) return;

        const ignoreStatus = db.prepare("SELECT value FROM settings WHERE key = 'ignore_status'").get() as any;
        if (ignoreStatus?.value === 'true' && remoteJid === 'status@broadcast') return;

        const autoRead = db.prepare("SELECT value FROM settings WHERE key = 'auto_read'").get() as any;
        if (autoRead?.value === 'true') {
            await sock.readMessages([msg.key]);
        }

        // Save message
        db.prepare("INSERT INTO messages (remoteJid, pushName, text, fromMe, timestamp) VALUES (?, ?, ?, ?, ?)")
            .run(remoteJid, pushName, text, 0, Math.floor(Date.now() / 1000));

        // Upsert lead
        db.prepare("INSERT INTO leads (remoteJid, name, lastInteraction) VALUES (?, ?, ?) ON CONFLICT(remoteJid) DO UPDATE SET lastInteraction = excluded.lastInteraction")
            .run(remoteJid, pushName, Math.floor(Date.now() / 1000));

        io.emit('new_message');

        // AI Response
        const history = db.prepare("SELECT text, fromMe FROM messages WHERE remoteJid = ? ORDER BY timestamp DESC LIMIT 5").all(remoteJid) as any[];
        const chatHistory = history.reverse().map(h => `${h.fromMe ? 'Bot' : 'Usuário'}: ${h.text}`).join('\n');
        
        const response = await getAIResponse(chatHistory, text);
        
        await sock.sendMessage(remoteJid, { text: response });
        
        db.prepare("INSERT INTO messages (remoteJid, pushName, text, fromMe, timestamp) VALUES (?, ?, ?, ?, ?)")
            .run(remoteJid, 'Bot', response, 1, Math.floor(Date.now() / 1000));
            
        io.emit('new_message');
    });
};

async function startServer() {
    if (process.env.NODE_ENV !== 'production') {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa',
        });
        app.use(vite.middlewares);
    }

    httpServer.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on port ${PORT}`);
        connectToWhatsApp();
    });
}

startServer();
