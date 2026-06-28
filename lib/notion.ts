import { Client } from "@notionhq/client";

export const notion = new Client({
  auth: process.env.NOTION_SECRET,
});

export const DATABASE_ID = process.env.NOTION_DATABASE_ID!;

// デフォルトのチームリスト（Notionに保存されているもの）
export const DEFAULT_TEAMS = [
  "北海道日本ハムファイターズ",
  "東北楽天ゴールデンイーグルス",
  "埼玉西武ライオンズ",
  "千葉ロッテマリーンズ",
  "福岡ソフトバンクホークス",
  "オリックスバファローズ",
  "読売ジャイアンツ",
  "東京ヤクルトスワローズ",
  "中日ドラゴンズ",
  "横浜DeNAベイスターズ",
  "阪神タイガース",
  "広島東洋カープ",
  "西武ライオンズ",
  "日本ハムファイターズ",
  "オリックス・ブルーウェーブ",
  "阪急ブレーブス",
  "大阪近鉄バファローズ",
  "福岡ダイエーホークス",
  "横浜ベイスターズ",
];

export const HANYOU_TARGETS = [
  "捕手","日本人野手","外国人野手","投手","若手","左打者","右打者","外国人投手","野手",
];

export type Song = {
  id: string;
  選手名: string;
  チーム名: string;
  前奏: string;
  歌詞: string;
  歌詞2: string;
  歌詞3: string;
  コール: string;
  備考: string;
  汎用: boolean;
  汎用の対象: string[];
  良曲: boolean;
  notionId: number | null;
};
