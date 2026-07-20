// 歌詞系フィールド保存時のテキスト正規化（全角スペース→半角、改行削除、！化、…化）
export function normalizeLyricsText(text: string): string {
  if (!text) return text;
  return text
    .replace(/\r\n|\r|\n/g, "")
    .replace(/　/g, " ")
    .replace(/\.{3,}/g, "…")
    .replace(/!/g, "！");
}
