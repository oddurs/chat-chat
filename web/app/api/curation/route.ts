import { NextRequest, NextResponse } from "next/server";
import { readCuration, toggleTurn, writeCuration } from "@/lib/curation";

export async function GET() {
  return NextResponse.json(readCuration());
}

export async function POST(req: NextRequest) {
  const { id, turn, ...patch } = await req.json();
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const all = typeof turn === "number" ? toggleTurn(id, turn) : writeCuration(id, patch);
  return NextResponse.json(all[id] ?? {});
}
