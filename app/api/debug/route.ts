import { NextResponse } from "next/server";
import { notion } from "@/lib/notion";

const TEMPLATE_DB_ID = process.env.NOTION_TEMPLATE_DB_ID!;

export async function GET() {
  try {
    // 通常のpages APIでテンプレートDBの子ページを取得
    const res = await (notion as any).search({
      query: "",
      filter: { property: "object", value: "page" },
      page_size: 100,
      sort: { direction: "descending", timestamp: "last_edited_time" },
    });

    const all = res.results as any[];
    const matched = all.filter(p =>
      p.parent?.database_id?.replace(/-/g,"") === TEMPLATE_DB_ID.replace(/-/g,"")
    );

    return NextResponse.json({
      TEMPLATE_DB_ID,
      total_from_search: all.length,
      matched: matched.length,
      parent_db_ids_found: [...new Set(all.map((p:any) => p.parent?.database_id).filter(Boolean))],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
