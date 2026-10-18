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
import { pipeline, env } from '@xenova/transformers';

// Optional: allow local model cache storage in container
env.allowLocalModels = false;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

const translators = {};

async function getTranslator(sourceLang, targetLang) {
    const key = `${sourceLang}-${targetLang}`;
    if (translators[key]) return translators[key];

    let modelName = 'Xenova/opus-mt-en-de';
    if (sourceLang === 'de' && targetLang === 'en') {
        modelName = 'Xenova/opus-mt-de-en';
    }

    console.log(`Loading translation model for ${key} (${modelName})...`);
    translators[key] = await pipeline('translation', modelName, {
        quantized: true
    });
    console.log(`Model ${key} loaded successfully.`);
    return translators[key];
}

app.post('/translate', async (req, res) => {
    try {
        const { text, texts, sourceLang = 'en', targetLang = 'de' } = req.body;
        const input = texts || text;
        console.log({ "Input": input });

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
            const translations = result.map(r => r.translation_text);
            console.log( { translations });
            return res.json({ translations });
        } else {
            const translation = result[0].translation_text;
            console.log( { translation });
            return res.json({ translation });
        }

    } catch (error) {
        console.error('Translation error:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
});