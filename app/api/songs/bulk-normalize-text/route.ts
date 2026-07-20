import { NextRequest, NextResponse } from "next/server";
import { notion } from "@/lib/notion";
import { normalizeLyricsText } from "@/lib/normalizeText";

const DATA_SOURCE_ID = "d988b900-6adc-830d-ac5f-879a083a50bb";

const TARGET_FIELDS = ["前奏", "歌詞", "歌詞2", "歌詞3", "交互演奏歌詞"] as const;

function getText(prop: any): string {
  if (!prop) return "";
  if (prop.type === "rich_text") return prop.rich_text?.map((t: any) => t.plain_text).join("") ?? "";
  return "";
}

async function fetchAllPages() {
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
  return all;
}

// POST /api/songs/bulk-normalize-text
// 既存の「前奏・歌詞・歌詞2・歌詞3・交互演奏歌詞」に一括で正規化（全角スペース→半角、改行削除、！化、…化）を適用
export async function POST(_req: NextRequest) {
  try {
    const pages = await fetchAllPages();

    let updated = 0;
    let unchanged = 0;

    await Promise.all(pages.map(async (p) => {
      const properties: Record<string, any> = {};
      for (const field of TARGET_FIELDS) {
        const current = getText(p.properties?.[field]);
        const normalized = normalizeLyricsText(current);
        if (normalized !== current) {
          properties[field] = { rich_text: [{ text: { content: normalized } }] };
        }
      }
      if (Object.keys(properties).length > 0) {
        await notion.pages.update({ page_id: p.id, properties });
        updated++;
      } else {
        unchanged++;
      }
    }));

    return NextResponse.json({ updated, unchanged, total: pages.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
