const contained = (file: string) =>
  /^[A-Za-z0-9._/-]+$/.test(file) &&
  !file.startsWith('/') &&
  !file.split('/').some((part) => !part || part === '.' || part === '..');

/** Path/type envelope only; Git must still check and apply the real diff inside the fresh container. */
export function validatePatch(text: string, allowedFiles: readonly string[]): string[] {
  if (text === '') return [];
  if (
    Buffer.byteLength(text) > 262144 ||
    text.includes('\0') ||
    /GIT binary patch|Binary files |^(?:new file mode|deleted file mode|old mode|new mode|rename from|rename to|copy from|copy to)/m.test(
      text,
    )
  )
    throw new Error('PATCH_REJECTED_UNSAFE');
  if (!text.startsWith('diff --git ')) throw new Error('PATCH_FORMAT_INVALID');
  const allowed = new Set(allowedFiles);
  if (allowedFiles.some((file) => !contained(file))) throw new Error('PATCH_ALLOWLIST_INVALID');
  const files: string[] = [];
  let current: string | undefined;
  let oldHeader = false;
  let newHeader = false;
  function finish(): void {
    if (current && (!oldHeader || !newHeader)) throw new Error('PATCH_HEADERS_INVALID');
  }
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) {
      finish();
      const match = /^diff --git a\/([A-Za-z0-9._/-]+) b\/([A-Za-z0-9._/-]+)$/.exec(line);
      if (
        !match ||
        match[1] !== match[2] ||
        !contained(match[1]!) ||
        !allowed.has(match[1]!) ||
        files.includes(match[1]!)
      )
        throw new Error('PATCH_REJECTED_UNSAFE');
      current = match[1]!;
      files.push(current);
      oldHeader = false;
      newHeader = false;
    } else if (line.startsWith('index ')) {
      if (!/^index [0-9a-f]+\.\.[0-9a-f]+(?: 100(?:644|755))?$/.test(line))
        throw new Error('PATCH_REJECTED_UNSAFE');
    } else if (line.startsWith('--- ')) {
      if (!current || oldHeader || line !== '--- a/' + current)
        throw new Error('PATCH_HEADERS_INVALID');
      oldHeader = true;
    } else if (line.startsWith('+++ ')) {
      if (!current || newHeader || line !== '+++ b/' + current)
        throw new Error('PATCH_HEADERS_INVALID');
      newHeader = true;
    }
  }
  finish();
  return files;
}
