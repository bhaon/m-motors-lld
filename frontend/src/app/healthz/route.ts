import { NextResponse } from "next/server";

/** Liveness Kubernetes : réponse minimale sans dépendance externe. */
export async function GET() {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
