// entrypoints/background/helpers.ts
// Utility functions for background service worker

export function getFormattedTime(date?: Date): string {
  const tempData = date || new Date();
  const hours = String(tempData.getHours()).padStart(2, '0');
  const minutes = String(tempData.getMinutes()).padStart(2, '0');
  const seconds = String(tempData.getSeconds()).padStart(2, '0');
  const ms = String(tempData.getMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}:${ms}`;
}

export function getBatchIndexForTime(
  cues: { start: number; duration: number; text: string }[],
  timeInSeconds: number
): number {
  if (!cues || cues.length === 0) return 0;
  const cueIndex = cues.findIndex((cue) => cue.start + cue.duration >= timeInSeconds);
  if (cueIndex === -1) return 0;
  return Math.floor(cueIndex / 3);
}
