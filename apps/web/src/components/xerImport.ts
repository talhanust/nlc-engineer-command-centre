// Reads a Primavera P6 .xer file as text.
//
// Two portability concerns, both handled here:
//  1. Encoding. P6 exports either UTF-8 or ANSI (Windows-1252). Decoding ANSI
//     bytes as UTF-8 mangles accented WBS / resource names, so we try strict
//     UTF-8 first and fall back to Windows-1252.
//  2. Blob.arrayBuffer() is missing on older Safari (and in jsdom), so fall
//     back to FileReader when it isn't available.
export async function readFileBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file.'));
    reader.readAsArrayBuffer(file);
  });
}

/** Decode .xer bytes, preferring UTF-8 and falling back to Windows-1252 (ANSI). */
export function decodeXer(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

export async function readXerText(file: File): Promise<string> {
  return decodeXer(await readFileBytes(file));
}

export const isXerFile = (file: File): boolean => /\.xer$/i.test(file.name);
