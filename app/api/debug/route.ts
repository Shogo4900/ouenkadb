import { NextResponse } from "next/server";
import { notion } from "@/lib/notion";

const TEMPLATE_DB_ID = process.env.NOTION_TEMPLATE_DB_ID!;

export async function GET() {
  try {
    // searchをcursorでページングして全件取得
    let all: any[] = [];
    let cursor: string | undefined = undefined;
    let page = 0;
    while (page < 5) {
      const res: any = await (notion as any).search({
        filter: { property: "object", value: "page" },
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      all.push(...res.results);
      page++;
      if (!res.has_more || !res.next_cursor) break;
      cursor = res.next_cursor;
    }

    const matched = all.filter(p =>
      p.parent?.database_id?.replace(/-/g,"") === TEMPLATE_DB_ID.replace(/-/g,"")
    );

    const parentIds = [...new Set(all.map((p:any) => p.parent?.database_id).filter(Boolean))];

    return NextResponse.json({
      TEMPLATE_DB_ID,
      total_pages_scanned: all.length,
      matched: matched.length,
      parent_db_ids_found: parentIds,
      matched_detail: matched.slice(0,3).map((p:any) => ({
        id: p.id,
        props: Object.keys(p.properties ?? {}),
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
