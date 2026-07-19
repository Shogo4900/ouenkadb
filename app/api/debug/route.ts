import { NextResponse } from "next/server";
import { notion } from "@/lib/notion";

const TEMPLATE_DB_ID = process.env.NOTION_TEMPLATE_DB_ID!;

export async function GET() {
  try {
    const res = await (notion as any).search({
      filter: { property: "object", value: "page" },
      page_size: 100,
    });

    const allPages = (res.results as any[]).map(p => ({
      id: p.id,
      parent_type: p.parent?.type,
      parent_db: p.parent?.database_id,
      props: Object.keys(p.properties ?? {}),
    }));

    const matched = (res.results as any[]).filter(p =>
      p.parent?.database_id?.replace(/-/g,"") === TEMPLATE_DB_ID?.replace(/-/g,"")
    );

    return NextResponse.json({
      TEMPLATE_DB_ID,
      total: res.results.length,
      allPages,
      matched: matched.length,
      matched_detail: matched.map((p:any) => ({
        id: p.id,
        props: p.properties,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
