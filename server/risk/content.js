import terms from "./dictionaries/abuse.json" with { type: "json" };

const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };

// Keep Unicode marks (\p{M}): Bangla vowel signs are marks, and stripping them
// splits words into fragments that can match unrelated text.
export function normalizeText(value) {
  return String(value || "").normalize("NFC").toLocaleLowerCase("en").replace(/[\u200b-\u200f\u2060\ufeff]/g, "");
}
const tokensOf = value => normalizeText(value).replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
// Only words that already contain a letter get digit swaps ("b1tch"); a plain
// house or road number stays a number.
const leet = value => (/\p{L}/u.test(value) ? [...value].map(char => LEET[char] ?? char).join("") : value);
function letterRuns(words) {
  const runs = [];
  let current = "";
  for (const word of words) {
    if ([...word].length === 1 && /\p{L}/u.test(word)) current += word;
    else { if (current) runs.push(current); current = ""; }
  }
  if (current) runs.push(current);
  return runs;
}
// Repeated letters collapse on both sides of the comparison ("fuuuck" = "fuck").
const squeeze = value => value.replace(/(\p{L})\1+/gu, "$1");

function abusive(fields, extraTerms) {
  const list = [...terms.english, ...terms.bangla, ...extraTerms]
    .filter(term => typeof term === "string")
    .map(term => tokensOf(term).map(squeeze).join(" "))
    .filter(term => term.length >= 3);
  for (const field of fields) {
    const tokens = tokensOf(field);
    const words = tokens.map(token => squeeze(leet(token)));
    const joined = ` ${words.join(" ")} `;
    // Letters separated by dots/spaces ("f.u.c.k") collapse into one word.
    const runs = letterRuns(words);
    for (const term of list) {
      if (joined.includes(` ${term} `)) return true;
      if (!term.includes(" ") && [...term].length >= 4 && runs.includes(term)) return true;
    }
  }
  return false;
}

export function classifyContent({ name, address, notes } = {}, extraTerms = []) {
  const codes = [];
  if (abusive([name, address, notes], Array.isArray(extraTerms) ? extraTerms : [])) codes.push("abusive_content");
  // Test/fake content is critical, so it only matches when the whole name or the
  // whole address is a placeholder. Phrases inside notes never block an order.
  const whole = value => tokensOf(value).join(" ");
  if ([name, address].some(value => terms.test.includes(whole(value)))) codes.push("test_content");
  return codes;
}
