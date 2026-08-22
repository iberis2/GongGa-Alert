function decodeBasicEntities(value: string) {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

function htmlToText(html: string) {
  return decodeBasicEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ");
}

function parseKoreanNumber(raw: string) {
  const numeric = raw.replace(/[^\d]/g, "");
  return numeric ? Number(numeric) : null;
}

export function parseWaitlistCount(html: string): number | null {
  const text = htmlToText(html);
  const labelIndex = text.indexOf("입주대기자");

  if (labelIndex === -1) {
    return null;
  }

  const afterLabel = text.slice(labelIndex, labelIndex + 160);
  const directMatch = afterLabel.match(/입주대기자(?:\s*수)?\s*[:：]?\s*([0-9][0-9,\s]*)\s*(?:명|세대)?/);

  if (directMatch?.[1]) {
    return parseKoreanNumber(directMatch[1]);
  }

  const firstNumberAfterLabel = afterLabel.match(/([0-9][0-9,\s]*)\s*(?:명|세대)?/);
  if (firstNumberAfterLabel?.[1]) {
    return parseKoreanNumber(firstNumberAfterLabel[1]);
  }

  return null;
}
