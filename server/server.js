// server/server.js

// Suppress ONNX runtime warning logs and noisy stdout messages
const originalLog = console.log;
const originalWarn = console.warn;

console.log = (...args) => {
    const msg = args.join(' ');
    if (msg.includes('onnxruntime') || msg.includes('CleanUnusedInitializers') || msg.includes('MarianTokenizer')) {
        return; // Skip unwanted warning prints
    }
    originalLog(...args);
};

console.warn = (...args) => {
    const msg = args.join(' ');
    if (msg.includes('onnxruntime') || msg.includes('MarianTokenizer')) {
        return; // Skip unwanted warning prints
    }
    originalWarn(...args);
};

import express from 'express';
import cors from 'cors';
import { pipeline } from '@xenova/transformers';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

const translators = {};

async function getTranslator(sourceLang, targetLang) {
    const key = `${sourceLang}-${targetLang}`;
    if (translators[key]) return translators[key];

    let modelName = 'Xenova/opus-mt-en-de';
    if (sourceLang === 'de' && targetLang === 'en') {
        modelName = 'Xenova/opus-mt-de-en';
    }

    console.log(`Loading translation model for ${key} (${modelName})...`);
    translators[key] = await pipeline('translation', modelName);
    console.log(`Model ${key} loaded successfully.`);
    return translators[key];
}

app.post('/translate', async (req, res) => {
    try {
        const { text, texts, sourceLang = 'en', targetLang = 'de' } = req.body;
        const input = texts || text;
        console.log({"Input":input})

        if (!input) {
            return res.status(400).json({ error: 'Missing input text or texts array.' });
        }

        const model = await getTranslator(sourceLang, targetLang);
        
        const result = await model(input, { 
            src_lang: sourceLang, 
            tgt_lang: targetLang,
            num_beams: 1 
        });

         if (Array.isArray(input)) {
            console.log({ translations: result.map(r => r.translation_text) })
            return res.json({ translations: result.map(r => r.translation_text) });
        } else {
            console.log({ translation: result[0].translation_text })
            return res.json({ translation: result[0].translation_text });
        }

    } catch (error) {
        console.error('Translation error:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});