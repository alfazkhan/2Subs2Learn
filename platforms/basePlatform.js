// platforms/basePlatform.js
export class BasePlatform {
    constructor() {
        if (this.constructor === BasePlatform) {
            throw new Error("Cannot instantiate abstract class BasePlatform directly.");
        }
    }

    // Returns true if the current URL matches this platform
    isSupported() {
        throw new Error("Method 'isSupported()' must be implemented.");
    }

    // Listens for network requests or DOM changes to capture subtitle data
    initSubtitleListener(onSubtitlesReady) {
        throw new Error("Method 'initSubtitleListener()' must be implemented.");
    }

    // Returns the current video element on the page
    getVideoElement() {
        throw new Error("Method 'getVideoElement()' must be implemented.");
    }
}