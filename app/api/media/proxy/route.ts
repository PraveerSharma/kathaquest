import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const allowedMediaHosts = new Set([
  "stream.videodb.io",
  "mmoug5tdn1.execute-api.us-west-2.amazonaws.com",
]);

function allowedUrl(value: string, base?: URL) {
  const url = new URL(value, base);
  if (url.protocol !== "https:" || !allowedMediaHosts.has(url.hostname)) {
    throw new Error("Media source is not allowlisted");
  }
  return url;
}

function proxyPath(url: URL) {
  return `/api/media/proxy?url=${encodeURIComponent(url.toString())}`;
}

function rewriteManifest(manifest: string, source: URL) {
  return manifest
    .split(/\r?\n/)
    .map((line) => {
      if (!line) return line;
      if (!line.startsWith("#")) {
        return proxyPath(allowedUrl(line, source));
      }
      return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
        return `URI="${proxyPath(allowedUrl(uri, source))}"`;
      });
    })
    .join("\n");
}

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const source = allowedUrl(requestUrl.searchParams.get("url") ?? "");
    const range = request.headers.get("range");
    const upstream = await fetch(source, {
      cache: "no-store",
      headers: range ? { range } : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(25_000),
    });
    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        { error: "VideoDB media is temporarily unavailable" },
        { status: upstream.status },
      );
    }

    const contentType = upstream.headers.get("content-type") ?? "";
    const manifest =
      source.pathname.endsWith(".m3u8") ||
      contentType.includes("mpegurl") ||
      contentType.includes("m3u8");
    if (manifest) {
      return new NextResponse(rewriteManifest(await upstream.text(), source), {
        headers: {
          "cache-control": "public, max-age=300, stale-while-revalidate=3600",
          "content-type": "application/vnd.apple.mpegurl",
        },
      });
    }

    const headers = new Headers({
      "cache-control": "public, max-age=86400, immutable",
      "content-type": contentType || "video/mp2t",
    });
    for (const name of [
      "accept-ranges",
      "content-length",
      "content-range",
      "etag",
      "last-modified",
    ]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid or unavailable media URL" },
      { status: 400 },
    );
  }
}
