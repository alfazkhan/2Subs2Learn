// entrypoints/popup/App.tsx
import React, { useEffect, useState } from 'react';
import './App.css';
import { storage } from '#imports';
import { YOUTUBE_TRANSLATION_LANGUAGES } from '@/constants/youtubeLanguages';
import type { TranslationPref, YouTubeCaptionTrack } from '@/types/youtubeTypes';

type SettingKey = 'sourceFontSize' | 'targetFontSize' | 'windowWidth' | 'verticalPosition';

const App: React.FC = () => {
  const [isExtensionPaused, setIsExtensionPaused] = useState<boolean>(false);
  const [sourceLang, setSourceLang] = useState<string>("English");
  const [targetLang, setTargetLang] = useState<string>("German");
  const [sourceFontSize, setSourceFontSize] = useState<number>(22);
  const [targetFontSize, setTargetFontSize] = useState<number>(16);
  const [windowWidth, setWindowWidth] = useState<number>(80);
  const [verticalPosition, setVerticalPosition] = useState<number>(8);

  useEffect(() => {
    console.log("Popup.jsx");
    const fetchData = async () => {
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
    };

    fetchData();
  }, []);

  const toggleExtension = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const paused = !e.target.checked;
    setIsExtensionPaused(paused);
    await storage.setItem<boolean>('local:isExtensionPaused', paused);
    try {
      const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) {
        await browser.tabs.reload(activeTab.id);
      }
    } catch (error) {
      console.error("[Popup] Failed to reload active tab:", error);
    }
  };

  const handleSettingChange = async (operation: '+' | '-', oldValue: number, key: SettingKey, setter: React.Dispatch<React.SetStateAction<number>>, min: number = 0, max: number = 100) => {
    const delta = operation === '+' ? 1 : -1;
    const nextValue = Math.min(Math.max(oldValue + delta, min), max);
    setter(nextValue);
    await storage.setItem(`local:${key}`, nextValue);
  };

  return (
    <div className="w-95 bg-[#12141c] text-white flex flex-col justify-between select-none font-sans min-h-100">
      <div className="p-4 flex flex-col gap-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-0.5 text-xl font-bold tracking-tight">
            <span>2Subs</span>
            <span className="text-[#f5a864]">2Learn</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tracking-wider text-gray-400">{isExtensionPaused ? "Paused" : "Enabled"}</span>
            <input type="checkbox"
              checked={!isExtensionPaused}
              onChange={toggleExtension}
              className="toggle border-gray-600 bg-gray-500 checked:border-orange-500 checked:bg-orange-400 checked:text-orange-800"
            />
          </div>
        </div>
        <div className="flex items-center justify-between mt-1">
          <h1 className="text-lg font-semibold text-gray-200">Settings</h1>
        </div>
      </div>
      <div className="flex flex-col grow divide-y divide-white/5">
        <RowItem onClick={() => { }}>
          <span className="text-sm font-medium text-gray-200">Translate From</span>
          <TranslateLanguageSelect value={sourceLang} setValue={setSourceLang} />
        </RowItem>
        <RowItem onClick={() => { }}>
          <span className="text-sm font-medium text-gray-200">Translate To</span>
          <TranslateLanguageSelect value={targetLang} setValue={setTargetLang} />
        </RowItem>
        <RowItem>
          <span className="text-sm font-medium text-gray-200">Target language size</span>
          <CounterControl value={`${sourceFontSize}px`} onChange={(op) => handleSettingChange(op, sourceFontSize, "sourceFontSize", setSourceFontSize, 8, 48)} />
        </RowItem>
        <RowItem>
          <span className="text-sm font-medium text-gray-200">My language size</span>
          <CounterControl value={`${targetFontSize}px`} onChange={(op) => handleSettingChange(op, targetFontSize, "targetFontSize", setTargetFontSize, 8, 48)} />
        </RowItem>
        <RowItem>
          <span className="text-sm font-medium text-gray-200">Translation window size</span>
          <CounterControl value={`${windowWidth}%`} onChange={(op) => handleSettingChange(op, windowWidth, "windowWidth", setWindowWidth, 20, 100)} />
        </RowItem>
        <RowItem>
          <span className="text-sm font-medium text-gray-200">Subs vertical position</span>
          <CounterControl value={`${verticalPosition}%`} onChange={(op) => handleSettingChange(op, verticalPosition, "verticalPosition", setVerticalPosition, 0, 90)} />
        </RowItem>
      </div>
    </div>
  );
};

const RowItem: React.FC<{ children: React.ReactNode; onClick?: () => void }> = ({ children, onClick }) => (
  <div
    onClick={onClick}
    className={`flex items-center justify-between px-4 py-3.5 transition ${onClick ? 'cursor-pointer hover:bg-white/5' : ''}`}
  >
    {children}
  </div>
);

const TranslateLanguageSelect: React.FC<{ value: string; setValue: React.Dispatch<React.SetStateAction<string>> }> = ({ value, setValue }) => (
  <div className="flex items-center gap-2 text-sm text-gray-400">
    <button
      className="btn btn-sm bg-[#20222d] hover:bg-[#20222d] text-white border-none shadow-none outline-none focus:outline-none"
      onClick={() => setValue('English')}
    >
      {value}
    </button>
    <ul className="dropdown menu w-52 rounded-box bg-base-100 shadow-sm">
      <li><a onClick={() => setValue('English')}>English</a></li>
      <li><a onClick={() => setValue('German')}>German</a></li>
      <li><a onClick={() => setValue('French')}>French</a></li>
      {/* Add more languages as needed */}
    </ul>
  </div>
);

const CounterControl: React.FC<{ value: string; onChange: (op: '+' | '-') => void }> = ({ value, onChange }) => (
  <div className="flex items-center gap-3">
    <button onClick={() => onChange('-')} className="w-7 h-7 rounded-full bg-[#f5a864] hover:bg-[#EE964B] text-black flex items-center justify-center font-bold transition cursor-pointer" type="button">-</button>
    <span className="text-sm font-semibold text-white w-10 text-center">{value}</span>
    <button onClick={() => onChange('+')} className="w-7 h-7 rounded-full bg-[#f5a864] hover:bg-[#EE964B] text-black flex items-center justify-center font-bold transition cursor-pointer" type="button">+</button>
  </div>
);

export default App;