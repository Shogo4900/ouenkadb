import { NextResponse } from "next/server";
import { notion } from "@/lib/notion";

const TEMPLATE_DB_ID = process.env.NOTION_TEMPLATE_DB_ID!;

export async function GET() {
  try {
    const res = await notion.pages.create({
      parent: { database_id: TEMPLATE_DB_ID },
      properties: {
        テンプレート名: { title: [{ text: { content: "テスト" } }] },
        内容: { rich_text: [{ text: { content: "⚪︎⚪︎！かっ飛ばせ！" } }] },
      },
    });
    return NextResponse.json({ ok: true, id: res.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack });
  }
}
