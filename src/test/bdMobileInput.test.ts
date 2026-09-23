import { describe, expect, it } from "vitest";
import { normalizeBdMobileInput as normalizeClient } from "@/lib/bdPhone";
import { normalizeBdMobileInput as normalizeServer } from "../../server/abandonedCheckouts.js";

const accepted: Array<[string, string]> = [
  ["01712345678", "01712345678"],
  ["+8801712345678", "01712345678"],
  ["01712 345678", "01712345678"],
  ["01712-345678", "01712345678"],
  [" +880 1712-345678 ", "01712345678"],
  ...["3", "4", "5", "6", "7", "8", "9"].map((digit): [string, string] => [`01${digit}12345678`, `01${digit}12345678`]),
];

const rejected = [
  "০১৭১২৩৪৫৬৭৮",
  "+৮৮০ ১৭১২-৩৪৫৬৭৮",
  "8801712345678",
  "+88001712345678",
  "(017) 12345678",
  "017.1234.5678",
  "01012345678",
  "01112345678",
  "01212345678",
  "0171234567",
  "017123456789",
  "1712345678",
  "",
];

describe.each([
  ["client", normalizeClient],
  ["server", normalizeServer],
])("typed Bangladesh mobile input (%s)", (_side, normalize) => {
  it.each(accepted)("accepts %j", (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });

  it.each(rejected)("rejects %j", (input) => {
    expect(normalize(input)).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(normalize(null)).toBeNull();
    expect(normalize(undefined)).toBeNull();
    expect(normalize(1712345678 as unknown as string)).toBeNull();
  });
});
