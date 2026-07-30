// Dictionary values are plain strings so they stay serialisable across the
// server/client boundary. Anything variable is written as a `{name}` placeholder
// and filled in here rather than by string concatenation at the call site, so
// translators keep control of word order.

export function format(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  )
}
