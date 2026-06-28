import { NextRequest, NextResponse } from "next/server";
import { notion, DATABASE_ID } from "@/lib/notion";

async function getTeams(): Promise<string[]> {
  const db = await notion.databases.retrieve({ database_id: DATABASE_ID }) as any;
  return db?.properties?.["チーム名"]?.select?.options?.map((o: any) => o.name) ?? [];
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
