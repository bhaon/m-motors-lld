import { NextResponse } from "next/server";

/** Readiness Kubernetes : même logique que healthz (pas d’appel API bloquant ici). */
export async function GET() {
  return NextResponse.json({ ready: true }, { status: 200 });
}
