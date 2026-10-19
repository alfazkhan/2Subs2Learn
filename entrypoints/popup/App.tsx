import { useEffect, useState } from 'react';
import './App.css';
import { YOUTUBE_TRANSLATION_LANGUAGES } from '@/constants/youtubeLanguages';
import type { TranslationPref, YouTubeCaptionTrack } from '@/types/youtubeTypes';

function App() {
  const [sourceLang, setSourceLang] = useState("English")
  const [targetLang, setTargetLang] = useState("German")
  const [sourceFontSize, setSourceFontSize] = useState<number | null>(22)
  const [targetFontSize, setTargetFontSize] = useState<number | null>(16)
  const [windowWidth, setWindowWidth] = useState<number | null>(80)
  const [verticalPosition, setVerticalPosition] = useState<number | null>(8)


  useEffect(() => {
    async function fetchData() {
      const translationPref: TranslationPref = await storage.getItem('local:translationPref');
      if (translationPref) {
        const sourceLang = YOUTUBE_TRANSLATION_LANGUAGES.find((element) => translationPref.sourceLang.includes(element.code))
        const targetLang = YOUTUBE_TRANSLATION_LANGUAGES.find((element) => translationPref.targetLang.includes(element.code))
        const currentVideoId: string = await storage.getItem('local:currentVideoID') || "";
        const availableTracks: [string, YouTubeCaptionTrack[]][] = await storage.getItem('local:availableTracks') || [];
        const captionsMap = new Map(availableTracks || []);
        const availableLanguages = captionsMap.get(currentVideoId)?.map((e) => (e.name.simpleText))
        console.log(availableLanguages)
        setSourceLang(sourceLang.name)
        setTargetLang(targetLang.name)
      }
      const sourceFontSize = await storage.getItem<number>('local:sourceFontSize');
      const targetFontSize = await storage.getItem<number>('local:targetFontSize');
      const windowWidth = await storage.getItem<number>('local:windowWidth');
      const verticalPosition = await storage.getItem<number>('local:verticalPosition');
      console.log(sourceFontSize, targetFontSize, windowWidth, verticalPosition)
      if (sourceFontSize) setSourceFontSize(sourceFontSize);
      if (targetFontSize) setTargetFontSize(targetFontSize);
      if (windowWidth) setWindowWidth(windowWidth)
      if (verticalPosition) setVerticalPosition(verticalPosition)
    }
    fetchData()
  }, [])

  async function changeHandler(operation: string, oldValue: number | null, value: string, changeFn: Function) {
    console.log(operation, oldValue)
    let newValue: number | null = oldValue
    if (operation === "+" && newValue) {
      newValue++
      changeFn(old => old + 1)
    } else if (operation === "-" && newValue) {
      newValue--
      changeFn(old => old - 1)
    } else {
      return
    }

    await storage.setItem(`local:${value}`, newValue)
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
            <span className="text-xs font-semibold tracking-wider text-gray-400">PAUSED</span>
            <input type="checkbox" className="toggle toggle-sm bg-gray-600 border-none [--tglbg:#fff]" defaultChecked />
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
            <button className="btn btn-sm bg-[#20222d] hover:bg-[#20222d] text-white border-none shadow-none outline-none focus:outline-none" popoverTarget="popover-1" style={{ anchorName: "--anchor-1" }}>
              {sourceLang}
            </button>

            <ul className="dropdown menu w-52 rounded-box bg-base-100 shadow-sm"
              popover="auto" id="popover-1" style={{ positionAnchor: "--anchor-1" }}>
              <li><a>Item 1</a></li>
              <li><a>Item 2</a></li>
            </ul>
          </div>
        </RowItem>

        <RowItem onClick={() => { }}>
          <span className="text-sm font-medium text-gray-200">Translate To</span>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <button className="btn btn-sm bg-[#20222d] hover:bg-[#20222d] text-white border-none shadow-none outline-none focus:outline-none" popoverTarget="popover-2" style={{ anchorName: "--anchor-2" }}>
              {targetLang}
            </button>

            <ul className="dropdown menu w-52 rounded-box bg-base-100 shadow-sm"
              popover="auto" id="popover-2" style={{ positionAnchor: "--anchor-2" }}>
              <li><a>Item 1</a></li>
              <li><a>Item 2</a></li>
            </ul>
          </div>
        </RowItem>

        <RowItem>
          <span className="text-sm font-medium text-gray-200">Target language size</span>
          <CounterControl
            value={sourceFontSize + "px"}
            onDecrease={() => changeHandler("-", sourceFontSize, "sourceFontSize", setSourceFontSize)}
            onIncrease={() => changeHandler("+", sourceFontSize, "sourceFontSize", setSourceFontSize)}
          />
        </RowItem>

        <RowItem>
          <span className="text-sm font-medium text-gray-200">My language size</span>
          <CounterControl
            value={targetFontSize + "px"}
            onDecrease={() => changeHandler("-", targetFontSize, "targetFontSize", setTargetFontSize)}
            onIncrease={() => changeHandler("+", targetFontSize, "targetFontSize", setTargetFontSize)}
          />
        </RowItem>

        <RowItem>
          <span className="text-sm font-medium text-gray-200">Translation window size</span>
          <CounterControl
            value={windowWidth + "%"}
            onDecrease={() => changeHandler("-", windowWidth, "windowWidth", setWindowWidth)}
            onIncrease={() => changeHandler("+", windowWidth, "windowWidth", setWindowWidth)}
          />
        </RowItem>

        <RowItem>
          <span className="text-sm font-medium text-gray-200">Subs vertical position</span>
          <CounterControl
            value={verticalPosition + "%"}
            onDecrease={() => changeHandler("-", verticalPosition, "verticalPosition", setVerticalPosition)}
            onIncrease={() => changeHandler("+", verticalPosition, "verticalPosition", setVerticalPosition)}
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
  value: number | string;
  onDecrease?: () => void;
  onIncrease?: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onDecrease}
        className="w-7 h-7 rounded-full bg-[#f5a864] hover:bg-[#EE964B] text-black flex items-center justify-center font-bold transition cursor-pointer"
      >
        -
      </button>
      <span className="text-sm font-semibold text-white w-10 text-center">{value}</span>
      <button
        onClick={onIncrease}
        className="w-7 h-7 rounded-full bg-[#f5a864] hover:bg-[#EE964B] text-black flex items-center justify-center font-bold transition cursor-pointer"
      >
        +
      </button>
    </div>
  );
}

export default App;