import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "HoodPackz V2 is not deployed. Pack opening is disabled and no funds were moved.",
      code: "V2_NOT_DEPLOYED",
    },
    { status: 503 }
  );
}
