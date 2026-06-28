import { NextRequest, NextResponse } from "next/server";
import { notion } from "@/lib/notion";

const TEMPLATE_DB_ID = process.env.NOTION_TEMPLATE_DB_ID!;

// Notionのsearch APIでDB内ページを取得（databases.queryがないSDKバージョン用）
async function fetchTemplates() {
  const res = await (notion as any).search({
    filter: { property: "object", value: "page" },
    page_size: 100,
  });
  // テンプレートDBの子ページのみ抽出
  const pages = (res.results as any[]).filter(p =>
    p.object === "page" && p.parent?.database_id?.replace(/-/g,"") === TEMPLATE_DB_ID.replace(/-/g,"")
  );
  return pages.map((p: any) => ({
    id: p.id,
    名前: p.properties?.["テンプレート名"]?.title?.map((t: any) => t.plain_text).join("") ?? "",
    内容: p.properties?.["内容"]?.rich_text?.map((t: any) => t.plain_text).join("") ?? "",
  }));
}

// GET /api/templates
export async function GET() {
  try {
    return NextResponse.json({ templates: await fetchTemplates() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/templates — 新規追加
export async function POST(req: NextRequest) {
  try {
    const { 名前, 内容 } = await req.json();
    if (!名前?.trim() || !内容?.trim())
      return NextResponse.json({ error: "名前と内容は必須です" }, { status: 400 });

    await notion.pages.create({
      parent: { database_id: TEMPLATE_DB_ID },
      properties: {
        テンプレート名: { title: [{ text: { content: 名前 } }] },
        内容: { rich_text: [{ text: { content: 内容 } }] },
      },
    });
    return NextResponse.json({ templates: await fetchTemplates() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/templates?id=xxx
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
