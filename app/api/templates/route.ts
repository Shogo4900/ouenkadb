import { NextRequest, NextResponse } from "next/server";
import { notion } from "@/lib/notion";

const TEMPLATE_DB_ID = process.env.NOTION_TEMPLATE_DB_ID!;
const DATA_SOURCE_ID = "d988b900-6adc-830d-ac5f-879a083a50bb";

async function fetchTemplates() {
  const res = await (notion as any).search({
    filter: { property: "object", value: "page" },
    page_size: 100,
  });
  const pages = (res.results as any[]).filter(p =>
    p.parent?.database_id?.replace(/-/g,"") === TEMPLATE_DB_ID.replace(/-/g,"")
  );
  return pages.map((p: any) => ({
    id: p.id,
    名前: p.properties?.["名前"]?.title?.map((t: any) => t.plain_text).join("") ?? "",
    内容: p.properties?.["内容"]?.rich_text?.map((t: any) => t.plain_text).join("") ?? "",
  }));
}

function applyTemplate(template: string, keyword: string): string {
  return template.replace(/⚪︎⚪︎/g, keyword);
}

export async function GET() {
  try {
    return NextResponse.json({ templates: await fetchTemplates() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { 名前, 内容 } = await req.json();
    if (!名前?.trim() || !内容?.trim())
      return NextResponse.json({ error: "名前と内容は必須です" }, { status: 400 });
    await notion.pages.create({
      parent: { database_id: TEMPLATE_DB_ID },
      properties: {
        名前: { title: [{ text: { content: 名前 } }] },
        内容: { rich_text: [{ text: { content: 内容 } }] },
      },
    });
    return NextResponse.json({ templates: await fetchTemplates() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/templates — テンプレート内容を編集 + 使用中レコードを一括更新
export async function PATCH(req: NextRequest) {
  try {
    const { id, 名前, 内容 } = await req.json();
    if (!id || !内容?.trim())
      return NextResponse.json({ error: "id と内容は必須です" }, { status: 400 });

    // 1. テンプレート自体を更新
    const updateProps: Record<string, any> = {
      内容: { rich_text: [{ text: { content: 内容 } }] },
    };
    if (名前?.trim()) updateProps["名前"] = { title: [{ text: { content: 名前 } }] };
    await notion.pages.update({ page_id: id, properties: updateProps });

    // 2. このテンプレートを使っている応援歌を全件取得して一括更新
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

    // テンプレートIDが一致するレコードのみ更新
    const targets = all.filter(p => {
      const tplId = p.properties?.["テンプレートID"]?.rich_text?.map((t: any) => t.plain_text).join("") ?? "";
      return tplId === id;
    });

    await Promise.all(targets.map(async (p) => {
      const keyword = p.properties?.["テンプレートキーワード"]?.rich_text?.map((t: any) => t.plain_text).join("") ?? "";
      const newCall = applyTemplate(内容, keyword);
      await notion.pages.update({
        page_id: p.id,
        properties: {
          コール: { rich_text: [{ text: { content: newCall } }] },
        },
      });
    }));

    return NextResponse.json({ templates: await fetchTemplates(), updated: targets.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    await notion.pages.update({ page_id: id, archived: true });
    return NextResponse.json({ templates: await fetchTemplates() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
