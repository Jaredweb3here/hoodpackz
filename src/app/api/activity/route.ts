import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "HoodPackz V2 activity is unavailable before deployment.", code: "V2_NOT_DEPLOYED" },
    { status: 503 }
  );
}
