/* ========================================
   Astrova — Uploads Passthrough Route
   Serves backend-hosted media files at the
   same public URL stored in the database
   (/api/uploads/heritage/<file>), so <img>
   tags work from the frontend origin.
   ======================================== */

import { NextRequest, NextResponse } from "next/server";

// Backend URL - server-side only
const BACKEND_URL = process.env.API_BASE_URL || "http://localhost:3001";

// Uploaded filenames are generated server-side (timestamp + hash + ext).
// Anything outside this charset is rejected (blocks path traversal).
const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;

  if (!path?.length || path.some((seg) => !SAFE_SEGMENT.test(seg) || seg === "..")) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "File not found." } },
      { status: 404 }
    );
  }

  const url = `${BACKEND_URL}/api/uploads/${path.join("/")}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      return new NextResponse(null, { status: response.status });
    }

    const data = await response.arrayBuffer();
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[Uploads] Backend request failed:", error);
    return NextResponse.json(
      { success: false, error: { code: "UPLOADS_PROXY_ERROR", message: "Failed to load file." } },
      { status: 502 }
    );
  }
}
