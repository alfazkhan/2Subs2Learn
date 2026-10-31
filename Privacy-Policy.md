# Privacy Policy for 2Subs2Learn

**Last updated:** 31 October 2026

2Subs2Learn ("the Extension") adds subtitle selection, translation, and display features to supported YouTube and ZDF Mediathek playback. This policy explains what information the Extension accesses, how it is used, where it is stored, and when information is exchanged with those services.

## 1. Who Is Responsible

The Extension is maintained by the 2Subs2Learn developer, reachable through the contact link in Section 10. The Extension does not require an account.

## 2. Information the Extension Processes

Depending on the features you use, the Extension may access or process:

- **Subtitle content:** Caption text and timing information for the video currently being played, so the Extension can display and translate subtitles.
- **Video and caption information:** A platform video identifier, caption-track language and display names, and the selected source and target languages. These are used to find the appropriate tracks and restore the language selection associated with a video.
- **Playback state:** For ZDF playback, the current playback time and state, along with the active video identifier and subtitle cues, are used to synchronize subtitles. This state is kept in browser extension storage.
- **Display preferences:** Whether the Extension is paused, subtitle font sizes, subtitle window width and position, and translation language selections.
- **Model download progress:** A download status and percentage used to display the progress of a translation-model download.

The Extension does not request or intentionally collect your name, email address, account credentials, payment information, precise location, contacts, or browsing history. It does not contain advertising, analytics, or tracking functionality.

## 3. How Information Is Used and Transmitted

### Subtitle retrieval

For YouTube, the Extension reads available caption-track information from the player and requests caption data from YouTube. When you select YouTube's auto-translated captions, the caption request includes the selected source and target language. YouTube receives these requests and may process them under its own privacy policy. The Extension does not send caption text to the 2Subs2Learn developer.

For ZDF Mediathek, the Extension reads the subtitle resource used by the ZDF player and requests that subtitle file from ZDF. ZDF receives the request and may process it under its own privacy policy. The Extension does not send subtitle text to the 2Subs2Learn developer.

### Translation

Translation is performed on the user's device using the browser's built-in translation capability when available, or a machine-learning translation model executed locally by the Extension. The Extension does not send subtitle text to the developer or to a third-party translation provider.

The local model may need to be downloaded from the model host (Hugging Face) before first use. This download contains model files, not the user's subtitle text. As with ordinary web requests, the model host and network providers may receive technical request information such as an IP address, request time, and requested file. The model files may be cached by the browser for later use.

The Extension may also rely on the browser and the supported video platform to obtain caption data or make a browser-provided translation feature available. Those services operate under their own privacy policies and settings; this policy does not govern their handling of information.

## 4. Local Storage and Retention

The Extension stores its settings and working data using the browser's extension storage. Depending on use, this can include language preferences, display settings, pause state, a video identifier and available YouTube caption-track details, and ZDF subtitle cues and playback synchronization state. Translation-model files may be retained in the browser's model cache.

This information is stored in the user's browser profile and is not uploaded to the Extension developer. Working playback state may be updated or cleared as playback changes, but preferences and other stored items may remain after a video is closed. Storage is retained until it is overwritten, cleared through the browser's extension-data controls, or removed when the Extension is uninstalled, subject to the browser's own data-removal behavior. Model-cache data may need to be cleared separately through the browser's site or storage controls.

The Extension does not maintain a separate account database or developer-side copy of this information. The developer therefore cannot retrieve or delete a user's local data on their behalf.

## 5. Sharing and Sale

The developer does not sell, rent, or share Extension-collected information with third parties. The Extension does not transmit subtitle text or its locally stored preferences to the developer. Information is exchanged directly with YouTube or ZDF when obtaining their captions, and with the model host when downloading model files, as described above. Those providers' independent collection and use are governed by their own policies.

## 6. Permissions

The Extension requests permissions for the following functions:

- **YouTube and ZDF host access:** Detect supported player and caption resources, retrieve captions, and render the subtitle interface on supported playback pages. Access is limited to the YouTube and ZDF host patterns declared by the Extension.
- **`storage`:** Save preferences and local playback/subtitle working state between Extension components and sessions.
- **`unlimitedStorage`:** Allow the browser to store the Extension's local data and related cached information without the ordinary extension-storage quota.
- **`tabs`:** Identify the active tab in the current window and reload it when the user changes the Extension's enabled or paused state.
- **`offscreen` (Chromium builds):** Run local translation inference in an offscreen Extension document so it does not occupy the visible page. Firefox uses its corresponding Extension runtime context instead.

The Extension does not use these permissions to build a browsing-history profile or send a list of visited pages to the developer.

## 7. Security

The Extension is designed to keep subtitle processing and Extension storage on the user's device. Local information is protected by the security of the browser profile and device. No method of storage or transmission is completely secure, and the developer cannot control the security practices of YouTube, ZDF, the model host, the browser, or the user's device.

## 8. Your Choices

You can stop the Extension from processing a page by pausing or disabling it, remove stored Extension data through your browser's extension settings, or uninstall the Extension. You can also use the controls provided by YouTube or ZDF to manage their captions and account or privacy settings. Clearing browser data may remove preferences or cached model files and can require the model to be downloaded again.

## 9. Children and Policy Changes

The Extension is a subtitle utility and is not designed to collect personal information from children. If the Extension's data practices change, this policy will be updated and its revision date changed. The current policy applies from the date shown at the top of this document.

## 10. Contact

For questions about this policy or the Extension's privacy practices, contact the developer through the [2Subs2Learn GitHub repository](https://github.com/alfazkhan/2Subs2Learn).