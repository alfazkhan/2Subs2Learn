// server/server.js

const originalLog = console.log;
const originalWarn = console.warn;

console.log = (...args) => {
    const msg = args.join(' ');
    if (msg.includes('onnxruntime') || msg.includes('CleanUnusedInitializers') || msg.includes('MarianTokenizer')) {
        return;
    }
    originalLog(...args);
};

console.warn = (...args) => {
    const msg = args.join(' ');
    if (msg.includes('onnxruntime') || msg.includes('MarianTokenizer')) {
        return;
    }
    originalWarn(...args);
};

import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.post('/translate', async (req, res) => {
    try {
        const { text, texts, sourceLang = 'en', targetLang = 'de' } = req.body;
        const inputs = Array.isArray(texts) ? texts : [text];

        if (!inputs[0]) {
            return res.status(400).json({ error: 'Missing input text.' });
        }

        // Translates via public instance with 0 MB model overhead
        const translations = await Promise.all(
            inputs.map(async (str) => {
                const url = `https://lingva.ml/api/v1/${sourceLang}/${targetLang}/${encodeURIComponent(str)}`;
                const response = await fetch(url);
                const data = await response.json();
                return data.translation;
            })
        );

        if (Array.isArray(texts)) {
            return res.json({ translations });
        } else {
            return res.json({ translation: translations[0] });
        }
    } catch (err) {
        console.error('Translation error:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
});