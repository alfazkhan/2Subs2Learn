// server/server.js

// Suppress ONNX runtime warning logs and noisy stdout messages
const originalLog = console.log;
const originalWarn = console.warn;

console.log = (...args) => {
  const msg = args.join(" ");
  if (
    msg.includes("onnxruntime") ||
    msg.includes("CleanUnusedInitializers") ||
    msg.includes("MarianTokenizer")
  ) {
    return; // Skip unwanted warning prints
  }
  originalLog(...args);
};

console.warn = (...args) => {
  const msg = args.join(" ");
  if (msg.includes("onnxruntime") || msg.includes("MarianTokenizer")) {
    return; // Skip unwanted warning prints
  }
  originalWarn(...args);
};

import express from "express";
import cors from "cors";
import { pipeline } from "@xenova/transformers";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// Formats timestamp to HH:MM:SS:MS
function getFormattedTime(date = new Date()) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
  return `${hours}:${minutes}:${seconds}:${milliseconds}`;
}

// In-memory cache holding initialized model pipelines
const translators = {};

// Formats byte numbers into human-readable MB
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 MB";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Terminal progress bar callback for @xenova/transformers
function handleModelDownloadProgress(info) {
  if (info.status === "initiate") {
    console.log(`[Download] Initiating: ${info.file || "file"}`);
    return;
  }

  if (info.status === "progress" && info.total) {
    const percent = Math.min(Math.max(info.progress || 0, 0), 100);
    const barWidth = 25;
    const filledWidth = Math.round((barWidth * percent) / 100);
    const emptyWidth = barWidth - filledWidth;
    const bar =
      "=".repeat(Math.max(0, filledWidth - 1)) +
      (filledWidth > 0 ? ">" : "") +
      " ".repeat(emptyWidth);

    const loadedStr = formatBytes(info.loaded);
    const totalStr = formatBytes(info.total);
    const fileName = (info.file || "").split("/").pop();

    process.stdout.write(
      `\r[Download] [${bar}] ${percent.toFixed(1)}\% \vert{}${loadedStr} / ${totalStr} \vert{}${fileName}   `,
    );
  }

  if (info.status === "done") {
    process.stdout.write("\n");
    console.log(`[Download] Finished: ${info.file || "file"}`);
  }
}

// Resolves or loads the model with visual progress tracking
async function getTranslator(
  modelChoice = "fast",
  sourceLang = "de",
  targetLang = "en",
) {
  // Hybrid mode: Meta M2M-100 (418M)
  if (modelChoice === "hybrid") {
    const key = "hybrid";
    if (translators[key]) return translators[key];

    const modelName = "Xenova/m2m100_418M";
    console.log(`[Server] Loading M2M100 model -> ${modelName}`);
    translators[key] = await pipeline("translation", modelName, {
      quantized: true,
      progress_callback: handleModelDownloadProgress,
    });
    console.log(`[Server] Model loaded successfully: ${key}`);
    return translators[key];
  }

  // Fast and accurate modes: Opus-MT
  const key = `${modelChoice}-${sourceLang}-${targetLang}`;
  if (translators[key]) return translators[key];

  let modelName = "Xenova/opus-mt-de-en";
  if (sourceLang === "en" && targetLang === "de") {
    modelName = "Xenova/opus-mt-en-de";
  }

  console.log(`[Server] Loading Opus model (${modelChoice}) ->${modelName}`);
  translators[key] = await pipeline("translation", modelName, {
    progress_callback: handleModelDownloadProgress,
  });
  console.log(`[Server] Model loaded successfully: ${key}`);

  return translators[key];
}

// Translates a single sentence with error fallback
async function translateSentence(translator, sentence, options) {
  const trimmed = sentence.trim();
  if (!trimmed) return "";
  try {
    const out = await translator(trimmed, options);
    return out[0].translation_text.trim();
  } catch (e) {
    return trimmed;
  }
}

// Splits multi-line and multi-sentence cues (? ! .) and reassembles them cleanly
async function translateFullCue(translator, rawCueText, options) {
  if (!rawCueText || typeof rawCueText !== "string") return rawCueText;

  const lines = rawCueText.split("\n");

  const translatedLines = await Promise.all(
    lines.map(async (line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return "";

      const sentences = trimmedLine.split(/(?<=[.?!])\s+/).filter(Boolean);

      if (sentences.length <= 1) {
        return await translateSentence(translator, trimmedLine, options);
      }

      const translatedSentences = await Promise.all(
        sentences.map((s) => translateSentence(translator, s, options)),
      );
      return translatedSentences.join(" ");
    }),
  );

  return translatedLines.join("\n");
}

app.post("/translate", async (req, res) => {
  try {
    const {
      text,
      texts,
      sourceLang = "de",
      targetLang = "en",
      model: modelChoice = "fast",
    } = req.body;
    const input = texts || text;

    console.log(getFormattedTime(), { Input: input, Mode: modelChoice });

    if (!input) {
      return res
        .status(400)
        .json({ error: "Missing input text or texts array." });
    }

    const translator = await getTranslator(modelChoice, sourceLang, targetLang);

    const num_beams = modelChoice === "accurate" ? 2 : 1;
    const options = {
      src_lang: sourceLang,
      tgt_lang: targetLang,
      num_beams,
      max_new_tokens: 50,
      repetition_penalty: 1.2,
      no_repeat_ngram_size: 3,
      early_stopping: true,
    };

    if (Array.isArray(input)) {
      const translations = await Promise.all(
        input.map((entry) => translateFullCue(translator, entry, options)),
      );
      console.log(getFormattedTime(), { translations });
      return res.json({ translations });
    } else {
      const translation = await translateFullCue(translator, input, options);
      console.log(getFormattedTime(), { translation });
      return res.json({ translation });
    }
  } catch (error) {
    console.error("Translation error:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
});

app.listen(PORT, async () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  try {
    console.log("[Server] Pre-warming hybrid model...");
    await getTranslator("hybrid");
    console.log("[Server] Hybrid model pre-warmed and ready in RAM.");
  } catch (err) {
    console.error("[Server] Failed to pre-load hybrid model:", err);
  }
});