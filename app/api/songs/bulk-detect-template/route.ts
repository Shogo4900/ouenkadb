import { NextRequest, NextResponse } from "next/server";
import { notion } from "@/lib/notion";

const DATA_SOURCE_ID = "d988b900-6adc-830d-ac5f-879a083a50bb";

function getText(prop: any): string {
  if (!prop) return "";
  if (prop.type === "title") return prop.title?.map((t: any) => t.plain_text).join("") ?? "";
  if (prop.type === "rich_text") return prop.rich_text?.map((t: any) => t.plain_text).join("") ?? "";
  return "";
}

function applyTemplate(template: string, keyword: string): string {
  return template.replace(/⚪︎⚪︎/g, keyword);
}

function guessTemplate(call: string, templates: { id: string; 内容: string }[]) {
  // 内容が長い（具体的な）テンプレートを優先
  const sorted = [...templates].sort((a, b) => b.内容.length - a.内容.length);
  for (const tpl of sorted) {
    const escaped = tpl.内容
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/⚪︎⚪︎/g, "(.+)");
    try {
      const match = call.match(new RegExp(`^${escaped}$`));
      if (match) return { tpl, keyword: match[1] ?? "" };
    } catch {}
  }
  return null;
}

// POST /api/songs/bulk-detect-template
// body: { templates: [{id, 内容}] }
export async function POST(req: NextRequest) {
  try {
    const { templates } = await req.json();
    if (!Array.isArray(templates)) {
      return NextResponse.json({ error: "templates is required" }, { status: 400 });
    }

    // 全件取得
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

    // テンプレートIDが未設定 かつ コールがある レコードを対象に判定
    const targets = all.filter(p => {
      const existingTplId = getText(p.properties?.["テンプレートID"]);
      const call = getText(p.properties?.["コール"]);
      return !existingTplId && call;
    });

    let updated = 0;
    let undetected = 0;

    await Promise.all(targets.map(async (p) => {
      const call = getText(p.properties?.["コール"]);
      const result = guessTemplate(call, templates);
      if (result) {
        await notion.pages.update({
          page_id: p.id,
          properties: {
            テンプレートID: { rich_text: [{ text: { content: result.tpl.id } }] },
            テンプレートキーワード: { rich_text: [{ text: { content: result.keyword } }] },
          },
        });
        updated++;
      } else {
        undetected++;
      }
    }));

    return NextResponse.json({ updated, undetected, total: targets.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
