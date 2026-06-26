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

const LIKE_REGEX = /\[like\]|\(like\)/i;

export function formatDianaText(text: string) {
  let formattedText = text.trim();

  // Удаляем пустые скобки, если нейросеть случайно их сгенерировала
  formattedText = formattedText.replace(/\(\)/g, "").trim();

  // Удаляем конечные точки (чтобы было более неформально)
  formattedText = formattedText.replace(/[.!]+$/, "");

  for (const [pattern, replacement] of INFORMAL_REPLACEMENTS) {
    formattedText = formattedText.replace(pattern, replacement);
  }

  // Делаем lowercase для всего текста (эмодзи и [like] при этом не пострадают)
  return formattedText.toLowerCase();
}

export function extractLikeIntent(text: string) {
  const hasLikeIntent = LIKE_REGEX.test(text);
  return {
    hasLikeIntent,
    text: hasLikeIntent ? text.replace(LIKE_REGEX, "").trim() : text,
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
