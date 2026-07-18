import { NextResponse } from "next/server";

function status() {
  return NextResponse.json(
    {
      message: "No privileged keeper API is required. MVP draws can be finalized permissionlessly after their target block.",
      code: "PERMISSIONLESS_FINALIZATION",
    },
    { status: 200 }
  );
}

export async function GET() {
  return status();
}

export async function POST() {
  return status();
}
