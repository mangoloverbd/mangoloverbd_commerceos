import terms from "./dictionaries/abuse.json" with { type: "json" };

const normalized = text => String(text || "").normalize("NFKC").toLocaleLowerCase("en").replace(/[\u200b-\u200f\u2060]/g, "").replace(/[0-9]/g, digit => ({ "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t" })[digit] || digit);
const words = text => normalized(text).replace(/[^\p{L}]+/gu, " ").trim().split(/\s+/);

export function classifyContent({ name, address, notes } = {}, extraTerms = []) {
  const text = normalized([name, address, notes].join(" "));
  const tokens = words(text);
  const collapsed = tokens.join("");
  const matches = term => {
    const parts = words(term).filter(Boolean);
    const phrase = parts.join(" ");
    const separated = parts.length === 1 && parts[0].length >= 4 && (` ${tokens.join(" ")} `).includes(` ${[...parts[0]].join(" ")} `);
    return phrase.length >= 4 && (` ${tokens.join(" ")} `).includes(` ${phrase} `)
      || parts.length === 1 && parts[0].length >= 4 && tokens.includes(parts[0])
      || parts.length === 1 && parts[0].length >= 4 && collapsed === parts[0]
      || separated;
  };
  const codes = [];
  if ([...terms.english, ...terms.bangla, ...extraTerms.filter(term => typeof term === "string" && term.length >= 4)].some(matches)) codes.push("abusive_content");
  if (terms.test.some(matches) || /^test$/i.test(String(name || "").trim())) codes.push("test_content");
  return codes;
}
