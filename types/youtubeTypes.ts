export interface languageInfo {
    "name": string,
    "languageCode": string,
}

export interface YouTubeCaptionTrack {
    baseUrl: string;
    name: {
        simpleText: string;
    };
    vssId: string;
    languageCode: string;
    isTranslatable: boolean;
    trackName: string;
    kind?: string
}

export interface TranslationPref {
    sourceLang: string;
    targetLang: string;
}

export interface ParsedCue {
    start: number;
    duration: number;
    text: string;
}


