import { NextResponse } from "next/server";
import { notion } from "@/lib/notion";

const TEMPLATE_DB_ID = process.env.NOTION_TEMPLATE_DB_ID!;

export async function GET() {
  try {
    // dataSources一覧を取得してテンプレートDBのdata_source_idを探す
    const res = await (notion as any).dataSources.retrieve({
      data_source_id: TEMPLATE_DB_ID,
    });
    return NextResponse.json({ res });
  } catch (e1: any) {
    // retrieveがなければlistを試す
    try {
      const res2 = await (notion as any).dataSources.query({
        data_source_id: TEMPLATE_DB_ID,
        query: `SELECT * FROM "collection://${TEMPLATE_DB_ID}" LIMIT 5`,
      });
      return NextResponse.json({ via_query: res2.results?.slice(0,2) });
    } catch (e2: any) {
      return NextResponse.json({ e1: e1.message, e2: e2.message });
    }
  }
}
