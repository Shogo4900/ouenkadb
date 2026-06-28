import { NextResponse } from "next/server";
import { notion } from "@/lib/notion";

const TEMPLATE_DB_ID = process.env.NOTION_TEMPLATE_DB_ID!;

export async function GET() {
  try {
    const res = await (notion as any).search({
      filter: { property: "object", value: "page" },
      page_size: 5,
    });
    const pages = (res.results as any[]).filter(p =>
      p.parent?.database_id?.replace(/-/g,"") === TEMPLATE_DB_ID.replace(/-/g,"")
    );
    return NextResponse.json({
      TEMPLATE_DB_ID,
      total_results: res.results.length,
      matched: pages.length,
      first_match_props: pages[0] ? Object.keys(pages[0].properties) : null,
      first_match: pages[0] ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
