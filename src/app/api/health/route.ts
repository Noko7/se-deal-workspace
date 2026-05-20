import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const started = Date.now();
  await prisma.$queryRaw`SELECT 1`;

  return NextResponse.json({
    status: "ok",
    latencyMs: Date.now() - started,
    timestamp: new Date().toISOString(),
  });
}
