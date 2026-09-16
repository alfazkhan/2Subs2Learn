import express from 'express';
import cors from 'cors';
import { pipeline } from '@xenova/transformers';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

let translator = null;

async function initializeModel() {
    console.log('Initializing translation model...');
    try {
        translator = await pipeline('translation', 'Xenova/opus-mt-en-de');
        console.log('Translation model loaded successfully.');
    } catch (error) {
        console.error('Failed to load translation model:', error);
        process.exit(1);
    }
}

// server.js snippet inside /translate
app.post('/translate', async (req, res) => {
    try {
        const { text, texts } = req.body;
        const input = texts || text;

        if (!input) {
            return res.status(400).json({ error: 'Missing input text or texts array.' });
        }

        if (!translator) {
            return res.status(503).json({ error: 'Model is still loading.' });
        }

        // Pass num_beams: 1 for maximum inference speed (greedy decoding)
        const result = await translator(input, { 
            src_lang: 'en', 
            tgt_lang: 'de',
            num_beams: 1 
        });

        console.log(result)
        if (Array.isArray(input)) {
            return res.json({ translations: result.map(r => r.translation_text) });
        } else {
            return res.json({ translation: result[0].translation_text });
        }


    } catch (error) {
        console.error('Translation error:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

app.listen(PORT, async () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    await initializeModel();
});