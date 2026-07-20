import { NextRequest, NextResponse } from "next/server";
import { notion, DATABASE_ID } from "@/lib/notion";
import { normalizeLyricsText } from "@/lib/normalizeText";

const DATA_SOURCE_ID = "d988b900-6adc-830d-ac5f-879a083a50bb";

function getText(prop: any): string {
  if (!prop) return "";
  if (prop.type === "title") return prop.title?.map((t: any) => t.plain_text).join("") ?? "";
  if (prop.type === "rich_text") return prop.rich_text?.map((t: any) => t.plain_text).join("") ?? "";
  return "";
}

function pageToSong(page: any) {
  const p = page.properties;
  return {
    id: page.id,
    選手名: getText(p["選手名"]),
    チーム名: p["チーム名"]?.select?.name ?? "",
    前奏: getText(p["前奏"]),
    歌詞: getText(p["歌詞"]),
    歌詞2: getText(p["歌詞2"]),
    歌詞3: getText(p["歌詞3"]),
    コール: getText(p["コール"]) === "なし" ? "" : getText(p["コール"]),
    備考: getText(p["備考"]),
    汎用: p["汎用"]?.checkbox ?? false,
    汎用の対象: p["汎用の対象"]?.multi_select?.map((o: any) => o.name) ?? [],
    良曲: p["良曲"]?.checkbox ?? false,
    重複除外: p["重複除外"]?.checkbox ?? false,
    流用: p["流用"]?.relation?.map((r: any) => r.id) ?? [],
    テンプレートID: getText(p["テンプレートID"]),
    テンプレートキーワード: getText(p["テンプレートキーワード"]),
    テンプレートなし: p["テンプレートなし"]?.checkbox ?? false,
    交互演奏: p["交互演奏"]?.checkbox ?? false,
    交互演奏歌詞: getText(p["交互演奏歌詞"]),
    notionId: p["ID"]?.unique_id?.number ?? null,
  };
}

async function fetchAllSongs() {
  const all: any[] = [];
  let cursor: string | undefined = undefined;
  while (true) {
    const res: any = await (notion as any).dataSources.query({
      data_source_id: DATA_SOURCE_ID,
      query: `SELECT * FROM "collection://${DATA_SOURCE_ID}" LIMIT 100`,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    all.push(...(res.results ?? []));
    if (!res.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return all.map(pageToSong);
}

export async function GET(_req: NextRequest) {
  try {
    return NextResponse.json({ songs: await fetchAllSongs() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const properties: Record<string, any> = {
      選手名: { title: [{ text: { content: body.選手名 ?? "" } }] },
      前奏: { rich_text: [{ text: { content: normalizeLyricsText(body.前奏 ?? "") } }] },
      歌詞: { rich_text: [{ text: { content: normalizeLyricsText(body.歌詞 ?? "") } }] },
      歌詞2: { rich_text: [{ text: { content: normalizeLyricsText(body.歌詞2 ?? "") } }] },
      歌詞3: { rich_text: [{ text: { content: normalizeLyricsText(body.歌詞3 ?? "") } }] },
      コール: { rich_text: [{ text: { content: body.コール ?? "" } }] },
      備考: { rich_text: [{ text: { content: body.備考 ?? "" } }] },
      汎用: { checkbox: body.汎用 ?? false },
      良曲: { checkbox: body.良曲 ?? false },
      重複除外: { checkbox: false },
      テンプレートなし: { checkbox: body.テンプレートなし ?? false },
      汎用の対象: { multi_select: (body.汎用の対象 ?? []).map((n: string) => ({ name: n })) },
      流用: { relation: (body.流用 ?? []).map((id: string) => ({ id })) },
      交互演奏: { checkbox: body.交互演奏 ?? false },
      交互演奏歌詞: { rich_text: [{ text: { content: normalizeLyricsText(body.交互演奏歌詞 ?? "") } }] },
      テンプレートID: { rich_text: [{ text: { content: body.テンプレートID ?? "" } }] },
      テンプレートキーワード: { rich_text: [{ text: { content: body.テンプレートキーワード ?? "" } }] },
    };
    if (body.チーム名) properties["チーム名"] = { select: { name: body.チーム名 } };
    const page = await notion.pages.create({ parent: { database_id: DATABASE_ID }, properties });
    return NextResponse.json({ id: page.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
