import { NextResponse } from "next/server";
import { notion } from "@/lib/notion";

const DATA_SOURCE_ID = "d988b900-6adc-830d-ac5f-879a083a50bb";

export async function GET() {
  try {
    const res = await (notion as any).dataSources.query({
      data_source_id: DATA_SOURCE_ID,
      query: `SELECT * FROM "collection://${DATA_SOURCE_ID}" LIMIT 2`,
    });
    return NextResponse.json({
      first_row: res.results?.[0] ?? null,
      keys: Object.keys(res.results?.[0] ?? {}),
      raw: res.results?.slice(0,2),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
