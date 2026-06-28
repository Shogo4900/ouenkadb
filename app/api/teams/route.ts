import { NextRequest, NextResponse } from "next/server";
import { notion, DATABASE_ID } from "@/lib/notion";

const DATA_SOURCE_ID = "d988b900-6adc-830d-ac5f-879a083a50bb";

async function getTeams(): Promise<string[]> {
  // 全ページからチーム名を収集して重複除去
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
  const names = all
    .map(p => p.properties?.["チーム名"]?.select?.name ?? "")
    .filter(Boolean);
  return [...new Set(names)].sort();
}

export async function GET() {
  try {
    return NextResponse.json({ teams: await getTeams() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json();
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const page = await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties: {
        選手名: { title: [{ text: { content: "__team_init__" } }] },
        チーム名: { select: { name } },
      },
    });
    await notion.pages.update({ page_id: page.id, archived: true });

    return NextResponse.json({ teams: await getTeams() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
