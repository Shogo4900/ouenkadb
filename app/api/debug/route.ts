import { NextResponse } from "next/server";
import { notion } from "@/lib/notion";

const TEMPLATE_DB_ID = process.env.NOTION_TEMPLATE_DB_ID!;

export async function GET() {
  try {
    const db = await notion.databases.retrieve({ database_id: TEMPLATE_DB_ID }) as any;
    const propNames = Object.keys(db.properties);
    return NextResponse.json({ propNames, props: db.properties });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
