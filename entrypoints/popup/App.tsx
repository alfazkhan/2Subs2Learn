import React, { useEffect, useState } from 'react';
import './App.css';
import { storage } from '#imports';
import { YOUTUBE_TRANSLATION_LANGUAGES } from '@/constants/youtubeLanguages';
import type { TranslationPref, YouTubeCaptionTrack } from '@/types/youtubeTypes';

type SettingKey = 'sourceFontSize' | 'targetFontSize' | 'windowWidth' | 'verticalPosition';

function App() {
  const [isExtensionPaused, setIsExtensionPaused] = useState<boolean>(false);
  const [sourceLang, setSourceLang] = useState<string>("English");
  const [targetLang, setTargetLang] = useState<string>("German");
  const [sourceFontSize, setSourceFontSize] = useState<number>(22);
  const [targetFontSize, setTargetFontSize] = useState<number>(16);
  const [windowWidth, setWindowWidth] = useState<number>(80);
  const [verticalPosition, setVerticalPosition] = useState<number>(8);

  useEffect(() => {
    const unwatchIsExtensionPaused = storage.watch<boolean>('local:isExtensionPaused', (newValue: boolean | null) => {
      if (newValue != null) setIsExtensionPaused(newValue);
      console.log(newValue)
    })
    console.log("Popup.jsx")
    async function fetchData() {
      // Fetch translation preferences and available tracks concurrently
      const [translationPref, currentVideoId, availableTracks] = await Promise.all([
        storage.getItem<TranslationPref>('local:translationPref'),
        storage.getItem<string>('local:currentVideoID'),
        storage.getItem<[string, YouTubeCaptionTrack[]][]>('local:availableTracks')
      ]);

      if (translationPref) {
        const matchedSource = YOUTUBE_TRANSLATION_LANGUAGES.find((element) =>
          translationPref.sourceLang?.includes(element.code)
        );
        const matchedTarget = YOUTUBE_TRANSLATION_LANGUAGES.find((element) =>
          translationPref.targetLang?.includes(element.code)
        );

        const videoId = currentVideoId || "";
        const captionsMap = new Map(availableTracks || []);
        const availableLanguages = captionsMap.get(videoId)?.map((e) => e.name.simpleText);
        console.log(availableLanguages);

        if (matchedSource?.name) setSourceLang(matchedSource.name);
        if (matchedTarget?.name) setTargetLang(matchedTarget.name);
      }

      // Fetch UI layout and font configuration concurrently
      const [
        storedPauseStatus,
        storedSourceFontSize,
        storedTargetFontSize,
        storedWindowWidth,
        storedVerticalPosition
      ] = await Promise.all([
        storage.getItem<boolean>('local:isExtensionPaused'),
        storage.getItem<number>('local:sourceFontSize'),
        storage.getItem<number>('local:targetFontSize'),
        storage.getItem<number>('local:windowWidth'),
        storage.getItem<number>('local:verticalPosition'),
      ]);

      console.log(storedPauseStatus, storedSourceFontSize, storedTargetFontSize, storedWindowWidth, storedVerticalPosition);

      if (storedPauseStatus != null) setIsExtensionPaused(storedPauseStatus);
      if (storedSourceFontSize != null) setSourceFontSize(storedSourceFontSize);
      if (storedTargetFontSize != null) setTargetFontSize(storedTargetFontSize);
      if (storedWindowWidth != null) setWindowWidth(storedWindowWidth);
      if (storedVerticalPosition != null) setVerticalPosition(storedVerticalPosition);
    }



    fetchData();



    return (() => {
      unwatchIsExtensionPaused()
    })
  }, []);

  // Generic handler for incrementing and decrementing numeric UI configuration values
  async function changeHandler(
    operation: '+' | '-',
    oldValue: number,
    key: SettingKey,
    setter: React.Dispatch<React.SetStateAction<number>>,
    min: number = 0,
    max: number = 100
  ) {
    console.log(operation, oldValue);

    const delta = operation === '+' ? 1 : -1;
    const nextValue = Math.min(Math.max(oldValue + delta, min), max);

    setter(nextValue);
    await storage.setItem(`local:${key}`, nextValue);
  }

  return (
    <div className="w-95 bg-[#12141c] text-white flex flex-col justify-between select-none font-sans min-h-100">

      {/* Top Header Section */}
      <div className="p-4 flex flex-col gap-4 border-b border-white/5">

        {/* Brand Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-0.5 text-xl font-bold tracking-tight">
            <span>2Subs</span>
            <span className="text-[#f5a864]">2Learn</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tracking-wider text-gray-400">{isExtensionPaused ? "Paused" : "Enabled"}</span>
            <input type="checkbox"
              value={`${isExtensionPaused}`}
              onChange={async (e) => await storage.setItem<boolean>('local:isExtensionPaused', e.target.value === "true" ? true : false)}
              className="toggle border-gray-600 bg-gray-500 checked:border-orange-500 checked:bg-orange-400 checked:text-orange-800"
            />
          </div>
        </div>

        {/* Sub Header */}
        <div className="flex items-center justify-between mt-1">
          <h1 className="text-lg font-semibold text-gray-200">Settings</h1>
        </div>

      </div>

      {/* Settings Menu List */}
      <div className="flex flex-col grow divide-y divide-white/5">

        <RowItem onClick={() => { }}>
          <span className="text-sm font-medium text-gray-200">Translate From</span>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <button
              className="btn btn-sm bg-[#20222d] hover:bg-[#20222d] text-white border-none shadow-none outline-none focus:outline-none"
              popoverTarget="popover-1"
              style={{ anchorName: "--anchor-1" } as React.CSSProperties}
            >
              {sourceLang}
            </button>

            <ul
              className="dropdown menu w-52 rounded-box bg-base-100 shadow-sm"
              popover="auto"
              id="popover-1"
              style={{ positionAnchor: "--anchor-1" } as React.CSSProperties}
            >
              <li><a>Item 1</a></li>
              <li><a>Item 2</a></li>
            </ul>
          </div>
        </RowItem>

        <RowItem onClick={() => { }}>
          <span className="text-sm font-medium text-gray-200">Translate To</span>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <button
              className="btn btn-sm bg-[#20222d] hover:bg-[#20222d] text-white border-none shadow-none outline-none focus:outline-none"
              popoverTarget="popover-2"
              style={{ anchorName: "--anchor-2" } as React.CSSProperties}
            >
              {targetLang}
            </button>

            <ul
              className="dropdown menu w-52 rounded-box bg-base-100 shadow-sm"
              popover="auto"
              id="popover-2"
              style={{ positionAnchor: "--anchor-2" } as React.CSSProperties}
            >
              <li><a>Item 1</a></li>
              <li><a>Item 2</a></li>
            </ul>
          </div>
        </RowItem>

        <RowItem>
          <span className="text-sm font-medium text-gray-200">Target language size</span>
          <CounterControl
            value={`${sourceFontSize}px`}
            onDecrease={() => changeHandler("-", sourceFontSize, "sourceFontSize", setSourceFontSize, 8, 48)}
            onIncrease={() => changeHandler("+", sourceFontSize, "sourceFontSize", setSourceFontSize, 8, 48)}
          />
        </RowItem>

        <RowItem>
          <span className="text-sm font-medium text-gray-200">My language size</span>
          <CounterControl
            value={`${targetFontSize}px`}
            onDecrease={() => changeHandler("-", targetFontSize, "targetFontSize", setTargetFontSize, 8, 48)}
            onIncrease={() => changeHandler("+", targetFontSize, "targetFontSize", setTargetFontSize, 8, 48)}
          />
        </RowItem>

        <RowItem>
          <span className="text-sm font-medium text-gray-200">Translation window size</span>
          <CounterControl
            value={`${windowWidth}%`}
            onDecrease={() => changeHandler("-", windowWidth, "windowWidth", setWindowWidth, 20, 100)}
            onIncrease={() => changeHandler("+", windowWidth, "windowWidth", setWindowWidth, 20, 100)}
          />
        </RowItem>

        <RowItem>
          <span className="text-sm font-medium text-gray-200">Subs vertical position</span>
          <CounterControl
            value={`${verticalPosition}%`}
            onDecrease={() => changeHandler("-", verticalPosition, "verticalPosition", setVerticalPosition, 0, 90)}
            onIncrease={() => changeHandler("+", verticalPosition, "verticalPosition", setVerticalPosition, 0, 90)}
          />
        </RowItem>

      </div>

    </div>
  );
}

function RowItem({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between px-4 py-3.5 transition ${onClick ? 'cursor-pointer hover:bg-white/5' : ''}`}
    >
      {children}
    </div>
  );
}

function CounterControl({
  value,
  onDecrease,
  onIncrease
}: {
  value: string;
  onDecrease?: () => void;
  onIncrease?: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onDecrease}
        className="w-7 h-7 rounded-full bg-[#f5a864] hover:bg-[#EE964B] text-black flex items-center justify-center font-bold transition cursor-pointer"
        type="button"
      >
        -
      </button>
      <span className="text-sm font-semibold text-white w-10 text-center">{value}</span>
      <button
        onClick={onIncrease}
        className="w-7 h-7 rounded-full bg-[#f5a864] hover:bg-[#EE964B] text-black flex items-center justify-center font-bold transition cursor-pointer"
        type="button"
      >
        +
      </button>
    </div>
  );
}

export default App;