// extension/src/core/translator.js
import { AppConfig } from './config.js';
import { logEvent } from './ui.js';

const memoryCache = new Map();
const pendingRequests = new Set();
const DB_NAME = '2Subs2LearnDB';
const STORE_NAME = 'translations';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

export async function clearTranslationCache() {
    memoryCache.clear();
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        logEvent("Translation Engine", "IndexedDB persistent cache cleared for new video.");
    } catch (e) {}
}

export async function hasTranslationStored(text) {
    const key = `${AppConfig.sourceLanguage}-${AppConfig.targetLanguage}:${text}`;
    if (memoryCache.has(key)) return true;
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(key);
            req.onsuccess = () => {
                if (req.result) {
                    memoryCache.set(key, req.result);
                    resolve(true);
                } else {
                    resolve(false);
                }
            };
            req.onerror = () => resolve(false);
        });
    } catch (e) {
        return false;
    }
}

export async function getStoredTranslation(text) {
    const key = `${AppConfig.sourceLanguage}-${AppConfig.targetLanguage}:${text}`;
    if (memoryCache.has(key)) return memoryCache.get(key);
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(key);
            req.onsuccess = () => {
                if (req.result) memoryCache.set(key, req.result);
                resolve(req.result || null);
            };
            req.onerror = () => resolve(null);
        });
    } catch (e) {
        return null;
    }
}

export async function translateTextsBatch(textsArray) {
    const cacheKeyPrefix = `${AppConfig.sourceLanguage}-${AppConfig.targetLanguage}:`;
    
    // Filter out texts already cached or currently pending network fetch
    const uncachedTexts = [];
    for (const t of textsArray) {
        const fullKey = cacheKeyPrefix + t;
        const exists = memoryCache.has(fullKey) || pendingRequests.has(fullKey);
        if (!exists) {
            const inDb = await hasTranslationStored(t);
            if (!inDb) {
                uncachedTexts.push(t);
                pendingRequests.add(fullKey);
            }
        }
    }

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
            const db = await openDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            for (let i = 0; i < uncachedTexts.length; i++) {
                const text = uncachedTexts[i];
                const translation = data.translations[i];
                const fullKey = cacheKeyPrefix + text;

                memoryCache.set(fullKey, translation);
                store.put(translation, fullKey);
                pendingRequests.delete(fullKey);
            }
            logEvent("Translation Engine", "Batch successfully translated and stored in IndexedDB.");
        }
    } catch (error) {
        for (const t of uncachedTexts) pendingRequests.delete(cacheKeyPrefix + t);
        logEvent("Translation Error", "Could not connect to local translation server.");
    }
}