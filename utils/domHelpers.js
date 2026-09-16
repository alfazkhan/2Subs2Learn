// utils/domHelpers.js

export function createSubtitleContainer(videoElement) {
    // Check if container already exists to avoid duplicates
    let container = document.getElementById('dual-subs-container');
    if (container) return container;

    container = document.createElement('div');
    container.id = 'dual-subs-container';
    
    // Find the best parent container (usually the video player wrapper)
    // If not found, fallback to appending directly to the parent of the video element
    const playerWrapper = videoElement.closest('.html5-video-player') || videoElement.parentElement;
    
    if (playerWrapper) {
        // Ensure the wrapper is relative so absolute positioning works correctly
        if (getComputedStyle(playerWrapper).position === 'static') {
            playerWrapper.style.position = 'relative';
        }
        playerWrapper.appendChild(container);
    } else {
        document.body.appendChild(container);
    }

    return container;
}

export function renderSubtitles(container, germanText, englishText) {
    container.innerHTML = `
        <div class="sub-line-german">${germanText || ''}</div>
        <div class="sub-line-english">${englishText || ''}</div>
    `;
}