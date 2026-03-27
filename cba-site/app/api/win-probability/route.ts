import { NextResponse } from "next/server";
import { getWinProbability } from "@/lib/store";

export async function GET() {
  try {
    const data = await getWinProbability();
    if (!data) {
      return NextResponse.json(
        { error: "No win probability data yet. Run /api/win-probability/refresh first." },
        { status: 404 }
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
