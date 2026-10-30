<div align="center">

![2Subs2Learn](./public/icon/2S_2L.png)

An advanced, cross-browser extension designed for language learners on **YouTube** and **ZDF**. Powered by client-side neural machine translation via Hugging Face Transformers.js and ONNX Runtime Web.

---

[![Version](https://img.shields.io/badge/version-0.0.5-blue.svg?style=flat-square)](https://github.com/alfazkhan/2Subs2Learn/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![WXT Framework](https://img.shields.io/badge/Framework-WXT-red.svg?style=flat-square)](https://wxt.dev/)
[![React](https://img.shields.io/badge/React-19.x-61DAFB.svg?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.x-38B2AC.svg?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![ONNX Runtime](https://img.shields.io/badge/ONNX-WebAssembly_%2F_WebGPU-005CED.svg?style=flat-square)](https://onnxruntime.ai/)

<br />

<p align="center">
  <a href="#-key-features">Key Features</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-supported-platforms--languages">Platforms & Languages</a> •
  <a href="#-usage--controls">Usage & Controls</a> •
  <a href="#-troubleshooting">Troubleshooting</a>
</p>

---

</div>

<div align="center">
  <img src="./assets/Screenshot-3.png" alt="YouTube Dual Subtitles" height="230"/>
  &nbsp;&nbsp;
  <img src="./assets/Screenshot-5.png" alt="ZDF Dual Subtitles" height="230"/>
  <br /><br />
  <img src="./assets/Screenshot-4.png" alt="Toolbar Customization" height="220"/>
  <br />
  <sub><em>Dual subtitle overlays on YouTube & ZDF, featuring real-time customizable font sizing, offsets, and positioning.</em></sub>
</div>

<br />

---

## ⚡ Key Features

- **100% In-Browser Machine Translation:** Powered by quantized Opus-MT models via `@xenova/transformers`. No third-party cloud translation APIs or external servers are required.
- **Zero Telemetry & Private by Design:** All subtitle parsing and neural inferences execute locally inside your browser sandbox. No video titles or captions ever leave your machine.
- **Sliding-Window Batch Prefetching:** Translates cues in small, pre-emptive chunks ahead of your current playback timestamp to ensure zero subtitle lag.
- **Smart Playback Auto-Sync:** Automatically holds playback state on uncached seek points while computing sentences, and automatically resumes once the target cue is decoded.
- **Robust Cross-Browser Engine:**
  - **Chromium (Chrome, Brave, Edge):** Uses the `chrome.offscreen` API with WebGPU acceleration and multithreaded WebAssembly workers, circumventing service worker limitations.
  - **Mozilla Firefox:** Native background execution running optimized single-core WASM routines without CSP or worker sandboxing conflicts.
- **Granular UI Styling:** Live adjust font sizes, container width, and vertical layout positions directly from the overlay or popup.

---

## 🏗️ Architecture

2Subs2Learn uses a client-side, reactive architecture that synchronizes subtitle translation across YouTube and ZDF platforms. The system prefetches subtitles ahead of playback using a sliding window approach, ensuring zero-latency subtitle display.

```mermaid
flowchart TD
    subgraph Content_Scripts
        A[YouTube Content Script] -->|Scrapes cues & monitors playhead| B{Reactive Storage}
        C[ZDF Content Script] -->|Scrapes cues & monitors playhead| B
    end
    
    subgraph Background_Service
        B -->|Priority prefetch queue| D[Background Service]
        D -->|Controls auto-pause/resume sync| E[Translation Engine]
    end
    
    subgraph Translation_Engine
        F[Chrome Offscreen API] -->|WebGPU acceleration| G[Opus-MT ONNX WASM]
        H[Firefox Native Background] -->|Single-core optimized| G
        I[Chrome Built-in AI] -->|window.translation/Gemini Nano| J[Fallback Translation]
    end
    
    B -.->|State synchronization| E
    G -->|Decoded sentences| K[Subtitle Display]
    J -->|Fallback subtitles| K
```

**Key Components:**
- **Content Scripts**: Scrape subtitle cues and monitor playback position on both platforms
- **Reactive Storage**: Synchronizes user preferences and translation state between scripts
- **Background Service**: Manages priority prefetch queue and controls auto-pause/resume behavior
- **Translation Engine**: Executes neural inference locally using WebGPU acceleration or native AI APIs
- **Subtitle Display**: Renders translated subtitles with customizable styling

---

## 📺 Supported Platforms & Languages

<div align="center">

| Platform | Domain | Subtitle Format | Supported Status |
| :--- | :--- | :--- | :--- |
| **YouTube** | `youtube.com/watch` | Timed Text XML / JSON3 | ✅ Supported |
| **ZDF Mediathek** | `zdf.de/play` | TTML / EBU-STL XML | ✅ Supported |

<br />

<img src="./assets/YT.png" alt="YouTube" height="40" />
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
<img src="./assets/ZDF.png" alt="ZDF" height="36" />

</div>

### Language Pairs
- 🇩🇪 **German $\rightarrow$ English** (`Xenova/opus-mt-de-en`)
- 🇬🇧 **English $\rightarrow$ German** (`Xenova/opus-mt-en-de`)
- *Additional model language pairs are scheduled for upcoming versions.*

---

## 🎛️ Usage & Controls

Once installed, 2Subs2Learn automatically detects playback on YouTube or ZDF.

- **Subtitle Font Sizing:** Change both target and source font sizes dynamically.
- **Vertical Offset:** Adjust the `bottom` percentage property to clear native player UI bars.
- **Container Sizing:** Limit or expand subtitle width from 30% to 100% of the player viewport.
- **Auto Pause Toggle:** Enable or disable smart auto-pausing during high-latency batch prefetching.

---

## 🤝 Feedback & Contributions

Issues, suggestions, and pull requests are welcome!

- **Website & Contact:** [theonlyalfaz.com](https://theonlyalfaz.com/)
- **Email:** [khanalfaaz14@gmail.com](mailto:khanalfaaz14@gmail.com)
- **Repository:** [github.com/alfazkhan/2Subs2Learn](https://github.com/alfazkhan/2Subs2Learn)
- **License:** [MIT](LICENSE)