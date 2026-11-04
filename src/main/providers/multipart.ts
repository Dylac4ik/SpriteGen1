/** Minimal multipart/form-data encoder for text fields (avoids FormData differences between fetch implementations). */
export function encodeMultipart(fields: Record<string, string | number | undefined | null>, boundary = `----spritegen${Math.random().toString(16).slice(2)}`): {
  body: Uint8Array;
  contentType: string;
} {
  const parts: string[] = [];
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name.replace(/"/g, '')}"\r\n\r\n${String(value)}\r\n`);
  }
  parts.push(`--${boundary}--\r\n`);
  return { body: new TextEncoder().encode(parts.join('')), contentType: `multipart/form-data; boundary=${boundary}` };
}
