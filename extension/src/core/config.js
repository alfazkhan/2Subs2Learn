// extension/src/core/config.js
export const AppConfig = {
    sourceLanguage: 'en',
    targetLanguage: 'de',
    primaryDisplay: 'target', // 'target' or 'source'
    translationServer: 'http://localhost:3000/translate',
    batchSize: 10,
    prefetchOffset: 3,

    updateSettings(settings) {
        if (settings.sourceLang) this.sourceLanguage = settings.sourceLang;
        if (settings.targetLang) this.targetLanguage = settings.targetLang;
        if (settings.primaryDisplay) this.primaryDisplay = settings.primaryDisplay;
        if (settings.batchSize) this.batchSize = parseInt(settings.batchSize, 10) || 10;
        if (settings.prefetchOffset) this.prefetchOffset = parseInt(settings.prefetchOffset, 10) || 3;
    }
};