import { NextRequest, NextResponse } from "next/server";
import { notion } from "@/lib/notion";

function toPageId(id: string): string {
  const match = id.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
             ?? id.match(/([0-9a-f]{32})/i);
  if (match) return match[1];
  return id;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const pageId = toPageId(decodeURIComponent(id));
    const body = await req.json();

    const properties: Record<string, any> = {};
    if (body.選手名 !== undefined) properties["選手名"] = { title: [{ text: { content: body.選手名 } }] };
    if (body.チーム名 !== undefined) properties["チーム名"] = body.チーム名 ? { select: { name: body.チーム名 } } : { select: null };
    if (body.前奏 !== undefined) properties["前奏"] = { rich_text: [{ text: { content: body.前奏 } }] };
    if (body.歌詞 !== undefined) properties["歌詞"] = { rich_text: [{ text: { content: body.歌詞 } }] };
    if (body.歌詞2 !== undefined) properties["歌詞2"] = { rich_text: [{ text: { content: body.歌詞2 } }] };
    if (body.歌詞3 !== undefined) properties["歌詞3"] = { rich_text: [{ text: { content: body.歌詞3 } }] };
    if (body.コール !== undefined) properties["コール"] = { rich_text: [{ text: { content: body.コール } }] };
    if (body.備考 !== undefined) properties["備考"] = { rich_text: [{ text: { content: body.備考 } }] };
    if (body.汎用 !== undefined) properties["汎用"] = { checkbox: body.汎用 };
    if (body.良曲 !== undefined) properties["良曲"] = { checkbox: body.良曲 };
    if (body.重複除外 !== undefined) properties["重複除外"] = { checkbox: body.重複除外 };
    if (body.汎用の対象 !== undefined) properties["汎用の対象"] = {
      multi_select: (body.汎用の対象 as string[]).map(n => ({ name: n }))
    };
    if (body.流用 !== undefined) properties["流用"] = {
      relation: (body.流用 as string[]).map(id => ({ id }))
    };

    await notion.pages.update({ page_id: pageId, properties });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const pageId = toPageId(decodeURIComponent(id));
    await notion.pages.update({ page_id: pageId, archived: true });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
