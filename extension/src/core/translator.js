// extension/src/core/translator.js
import { AppConfig } from './config.js';
import { logEvent } from './ui.js';

const translationCache = new Map();

export function clearTranslationCache() {
    translationCache.clear();
    logEvent("Translation Engine", "Translation cache cleared for new video.");
}

export async function translateTextsBatch(textsArray) {
    const cacheKeyPrefix = `${AppConfig.sourceLanguage}-${AppConfig.targetLanguage}:`;
    const uncachedTexts = textsArray.filter(t => !translationCache.has(cacheKeyPrefix + t));
    if (uncachedTexts.length === 0) return;

    try {
        logEvent("Translation Engine", `Sending batch of ${uncachedTexts.length} items (${AppConfig.sourceLanguage} -> ${AppConfig.targetLanguage}).`);
        const response = await fetch(AppConfig.translationServer, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                texts: uncachedTexts,
                sourceLang: AppConfig.sourceLanguage,
                targetLang: AppConfig.targetLanguage
            }),
        });
        
        if (!response.ok) throw new Error("Server error");
        
        const data = await response.json();
        if (data.translations) {
            for (let i = 0; i < uncachedTexts.length; i++) {
                translationCache.set(cacheKeyPrefix + uncachedTexts[i], data.translations[i]);
            }
            logEvent("Translation Engine", "Batch successfully translated and cached.");
        }
    } catch (error) {
        logEvent("Translation Error", "Could not connect to local translation server.");
    }
}

export function getCachedTranslation(text) {
    const cacheKeyPrefix = `${AppConfig.sourceLanguage}-${AppConfig.targetLanguage}:`;
    return translationCache.get(cacheKeyPrefix + text);
}

export function hasTranslation(text) {
    const cacheKeyPrefix = `${AppConfig.sourceLanguage}-${AppConfig.targetLanguage}:`;
    return translationCache.has(cacheKeyPrefix + text);
}