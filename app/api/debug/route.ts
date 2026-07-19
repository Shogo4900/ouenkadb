import { NextResponse } from "next/server";
import { notion } from "@/lib/notion";

const TEMPLATE_DB_ID = process.env.NOTION_TEMPLATE_DB_ID!;

export async function GET() {
  try {
    // databaseオブジェクトとして検索
    const res1 = await (notion as any).search({
      filter: { property: "object", value: "database" },
      page_size: 100,
    });

    const dbs = (res1.results as any[]).map((d:any) => ({
      id: d.id,
      id_clean: d.id.replace(/-/g,""),
      title: d.title?.[0]?.plain_text ?? "",
    }));

    // pageオブジェクトで全件取得（cursor使って2ページ目も）
    const res2 = await (notion as any).search({
      filter: { property: "object", value: "page" },
      page_size: 100,
      start_cursor: res1.next_cursor ?? undefined,
    });

    const pages2 = (res2.results as any[]);
    const matched2 = pages2.filter(p =>
      p.parent?.database_id?.replace(/-/g,"") === TEMPLATE_DB_ID.replace(/-/g,"")
    );

    return NextResponse.json({
      TEMPLATE_DB_ID,
      databases_found: dbs,
      page2_total: pages2.length,
      page2_matched: matched2.length,
      page2_parent_ids: [...new Set(pages2.map((p:any)=>p.parent?.database_id).filter(Boolean))],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
