export const EXTRACT_WORDS_FN = (sentence: string) => sentence
  .replace(/[^a-zA-Z0-9]/g, ' ')
  .trim()
  .toLowerCase()
  .split(/\s+/)
  .filter(w => w);
