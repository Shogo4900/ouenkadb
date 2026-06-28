import { NextRequest, NextResponse } from "next/server";
import { notion, DATABASE_ID } from "@/lib/notion";

const DATA_SOURCE_ID = "d988b900-6adc-830d-ac5f-879a083a50bb";
const COLLECTION_URL = `collection://${DATA_SOURCE_ID}`;

function rowToSong(row: Record<string, any>) {
  let targets: string[] = [];
  try { targets = JSON.parse(row["汎用の対象"] ?? "[]"); } catch {}
  return {
    id: row.url as string,
    選手名: row["選手名"] ?? "",
    チーム名: row["チーム名"] ?? "",
    前奏: row["前奏"] ?? "",
    歌詞: row["歌詞"] ?? "",
    歌詞2: row["歌詞2"] ?? "",
    歌詞3: row["歌詞3"] ?? "",
    コール: row["コール"] ?? "",
    備考: row["備考"] ?? "",
    汎用: row["汎用"] === "__YES__",
    汎用の対象: targets,
    良曲: row["良曲"] === "__YES__",
    重複除外: row["重複除外"] === "__YES__",
    notionId: row["userDefined:ID"] ?? null,
  };
}

// 全件取得（100件ずつループ）
async function fetchAllSongs() {
  const allRows: Record<string, any>[] = [];
  let cursor: string | undefined = undefined;

  while (true) {
    const sql = `SELECT url, "選手名", "チーム名", "前奏", "歌詞", "歌詞2", "歌詞3", "コール", "備考", "汎用", "汎用の対象", "良曲", "重複除外", "userDefined:ID" FROM "${COLLECTION_URL}" ORDER BY "userDefined:ID" DESC LIMIT 100`;
    const res: { results?: Record<string,any>[]; has_more?: boolean; next_cursor?: string } = await (notion as any).dataSources.query({
      data_source_id: DATA_SOURCE_ID,
      query: sql,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    allRows.push(...(res.results ?? []));
    if (!res.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return allRows.map(rowToSong);
}

// GET /api/songs?team=xxx&q=xxx&searchType=name|lyrics
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const team = searchParams.get("team") ?? "";
    const q = searchParams.get("q") ?? "";
    const searchType = searchParams.get("searchType") ?? "name"; // "name" | "lyrics"

    let songs = await fetchAllSongs();

    // フィルタリング（サーバーサイド）
    if (team) songs = songs.filter(s => s.チーム名 === team);
    if (q) {
      const lower = q.toLowerCase();
      if (searchType === "lyrics") {
        songs = songs.filter(s =>
          s.歌詞.includes(q) || s.歌詞2.includes(q) || s.歌詞3.includes(q) || s.コール.includes(q)
        );
      } else {
        songs = songs.filter(s => s.選手名.includes(q));
      }
    }

    return NextResponse.json({ songs });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/songs
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const properties: Record<string, any> = {
      選手名: { title: [{ text: { content: body.選手名 ?? "" } }] },
      前奏: { rich_text: [{ text: { content: body.前奏 ?? "" } }] },
      歌詞: { rich_text: [{ text: { content: body.歌詞 ?? "" } }] },
      歌詞2: { rich_text: [{ text: { content: body.歌詞2 ?? "" } }] },
      歌詞3: { rich_text: [{ text: { content: body.歌詞3 ?? "" } }] },
      コール: { rich_text: [{ text: { content: body.コール ?? "" } }] },
      備考: { rich_text: [{ text: { content: body.備考 ?? "" } }] },
      汎用: { checkbox: body.汎用 ?? false },
      良曲: { checkbox: body.良曲 ?? false },
      重複除外: { checkbox: false },
      汎用の対象: { multi_select: (body.汎用の対象 ?? []).map((n: string) => ({ name: n })) },
    };
    if (body.チーム名) properties["チーム名"] = { select: { name: body.チーム名 } };

    const page = await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties,
    });
    return NextResponse.json({ id: page.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
