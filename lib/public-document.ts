const PUBLIC_HTML_HEADERS = {
  "Cache-Control": "public, max-age=0, must-revalidate",
  "Content-Type": "text/html; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
} as const;

export function publicDocumentResponse(source: string) {
  return new Response(source, { headers: PUBLIC_HTML_HEADERS });
}
