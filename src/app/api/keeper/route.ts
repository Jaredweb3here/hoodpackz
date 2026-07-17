import { NextResponse } from "next/server";

function retired() {
  return NextResponse.json(
    {
      error: "The single-keeper coordinator is retired. HoodPackz V2 uses bonded threshold signatures.",
      code: "LEGACY_KEEPER_RETIRED",
    },
    { status: 410 }
  );
}

export async function GET() {
  return retired();
}

export async function POST() {
  return retired();
}
