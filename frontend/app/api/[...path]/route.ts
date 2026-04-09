import { NextRequest, NextResponse } from "next/server";

const RETRYABLE_ERROR_PATTERNS = [
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "fetch failed",
];

const MAX_PROXY_RETRIES = 20;
const RETRY_BACKOFF_BASE_MS = 300;
const RETRY_BACKOFF_MAX_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableProxyError(error: unknown): boolean {
  const serialized = String(error);
  return RETRYABLE_ERROR_PATTERNS.some((pattern) => serialized.includes(pattern));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, await params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, await params);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, await params);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, await params);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, await params);
}

async function proxyRequest(request: NextRequest, params: { path: string[] }) {
  const backendHost = process.env.OPENRAG_BACKEND_HOST || "localhost";
  const backendSSL = String(process.env.OPENRAG_BACKEND_SSL || "false").toLowerCase() === "true";
  const protocol = backendSSL ? "https" : "http";
  const candidateHostsRaw = Array.from(
    new Set([backendHost, "openrag-backend"].filter(Boolean)),
  );
  const candidateHosts =
    backendHost === "localhost"
      ? ["openrag-backend", ...candidateHostsRaw.filter((h) => h !== "openrag-backend")]
      : candidateHostsRaw;
  const path = params.path.join("/");
  const searchParams = request.nextUrl.searchParams.toString();

  try {
    let body: string | ArrayBuffer | undefined = undefined;
    let willSendBody = false;

    if (request.method !== "GET" && request.method !== "HEAD") {
      const contentType = request.headers.get("content-type") || "";
      const contentLength = request.headers.get("content-length");

      // For file uploads (multipart/form-data), preserve binary data
      if (contentType.includes("multipart/form-data")) {
        const buf = await request.arrayBuffer();
        if (buf && buf.byteLength > 0) {
          body = buf;
          willSendBody = true;
        }
      } else {
        // For JSON and other text-based content, use text
        const text = await request.text();
        if (text && text.length > 0) {
          body = text;
          willSendBody = true;
        }
      }

      // Guard against incorrect non-zero content-length when there is no body
      if (!willSendBody && contentLength) {
        // We'll drop content-length/header below
      }
    }

    const headers = new Headers();

    // Copy relevant headers from the original request
    for (const [key, value] of request.headers.entries()) {
      const lower = key.toLowerCase();
      if (
        lower.startsWith("host") ||
        lower.startsWith("x-forwarded") ||
        lower.startsWith("x-real-ip") ||
        lower === "expect" ||
        lower === "connection" ||
        lower === "transfer-encoding" ||
        lower === "upgrade" ||
        lower === "proxy-connection" ||
        lower === "content-length" ||
        (!willSendBody && lower === "content-type")
      ) {
        continue;
      }
      headers.set(key, value);
    }

    const init: RequestInit = {
      method: request.method,
      headers,
    };
    if (willSendBody) {
      // Convert ArrayBuffer to Uint8Array to satisfy BodyInit in all environments
      const bodyInit: BodyInit =
        typeof body === "string" ? body : new Uint8Array(body as ArrayBuffer);
      init.body = bodyInit;
    }
    let response: Response | null = null;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_PROXY_RETRIES; attempt++) {
      for (const host of candidateHosts) {
        const backendUrl = `${protocol}://${host}:8000/${path}${searchParams ? `?${searchParams}` : ""}`;
        try {
          response = await fetch(backendUrl, init);
          break;
        } catch (error) {
          lastError = error;
          if (!isRetryableProxyError(error)) {
            throw error;
          }
          console.warn("Proxy retryable error", {
            attempt,
            backendUrl,
            error: String(error),
          });
        }
      }

      if (response) {
        break;
      }

      const backoffMs = Math.min(RETRY_BACKOFF_BASE_MS * attempt, RETRY_BACKOFF_MAX_MS);
      await sleep(backoffMs);
    }

    if (!response) {
      throw lastError ?? new Error("Backend unavailable after retries");
    }

    const responseHeaders = new Headers();

    // Copy response headers
    for (const [key, value] of response.headers.entries()) {
      if (
        !key.toLowerCase().startsWith("transfer-encoding") &&
        !key.toLowerCase().startsWith("connection")
      ) {
        responseHeaders.set(key, value);
      }
    }

    // Explicitly forward Set-Cookie headers (entries() may omit them)
    for (const cookie of response.headers.getSetCookie()) {
      responseHeaders.append("set-cookie", cookie);
    }

    // For streaming responses, pass the body directly without buffering
    if (response.body) {
      return new NextResponse(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } else {
      // Fallback for non-streaming responses
      const responseBody = await response.text();
      return new NextResponse(responseBody, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    }
  } catch (error) {
    console.error("Proxy error:", error);
    return NextResponse.json(
      { error: "Failed to proxy request" },
      { status: 500 },
    );
  }
}
