import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "The legacy stock feed is retired and is not part of HoodPackz V2.", code: "LEGACY_API_RETIRED" },
    { status: 410 }
  );
}
