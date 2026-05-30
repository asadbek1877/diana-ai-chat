const LIKE_TAG = "[LIKE]";
const SEARCH_TAG = "SEARCH:";
const MAX_SEARCH_QUERY_LENGTH = 120;

const INFORMAL_REPLACEMENTS: Array<[RegExp, string]> = [
  [/Я понимаю/gi, "понятненько"],
  [/Конечно/gi, "ну да"],
  [/Безусловно/gi, "сто пудов"],
  [/Извини/gi, "сорян"],
  [/Хорошо/gi, "окей"],
];

export function formatDianaText(text: string) {
  let formattedText = text.trim().replace(/[.!]+$/, "");

  for (const [pattern, replacement] of INFORMAL_REPLACEMENTS) {
    formattedText = formattedText.replace(pattern, replacement);
  }

  if (formattedText.length > 0 && !formattedText.startsWith(LIKE_TAG)) {
    return formattedText.toLowerCase();
  }

  if (formattedText.startsWith(LIKE_TAG) && formattedText.length > LIKE_TAG.length) {
    return LIKE_TAG + formattedText.substring(LIKE_TAG.length).toLowerCase();
  }

  return formattedText;
}

export function extractLikeIntent(text: string) {
  const hasLikeIntent = text.includes(LIKE_TAG);
  return {
    hasLikeIntent,
    text: hasLikeIntent ? text.replace(LIKE_TAG, "").trim() : text,
  };
}

export function splitReplyIntoMessages(text: string) {
  return text.split("\n\n").filter((sentence) => sentence.trim().length > 0);
}

function sanitizeSearchQuery(query: string) {
  return query
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SEARCH_QUERY_LENGTH);
}

export function extractSearchQuery(text: string) {
  const tagIndex = text.indexOf(SEARCH_TAG);
  if (tagIndex === -1) return null;

  const rawQuery = text
    .slice(tagIndex + SEARCH_TAG.length)
    .split(/\r?\n/)[0]
    ?.trim();
  if (!rawQuery) return null;

  return sanitizeSearchQuery(rawQuery) || null;
}

export function buildSearchAugmentedPrompt(searchResults: string) {
  return `Internet search results: ${searchResults}. Reply to the user using these results.`;
}
