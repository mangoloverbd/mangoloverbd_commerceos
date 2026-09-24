import locations from "./dictionaries/bdLocations.json" with { type: "json" };
import dictionary from "./dictionaries/abuse.json" with { type: "json" };

// Unicode marks are kept: Bangla vowel signs are marks, and removing them would
// split place names into fragments that match unrelated words.
const normalized = value => String(value || "").normalize("NFC").toLocaleLowerCase("en")
  .replace(/[\u200b-\u200f\u2060\ufeff]/g, "").replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
const contains = (text, value) => {
  const needle = normalized(value);
  return Boolean(needle) && (` ${text} `).includes(` ${needle} `);
};

// Common spellings and major city areas that are not district names themselves.
const DHAKA_AREAS = ["dhanmondi", "gulshan", "banani", "uttara", "mohammadpur", "mohammedpur", "badda", "rampura", "khilgaon", "motijheel", "tejgaon", "farmgate", "shyamoli", "jatrabari", "pallabi", "bashundhara", "baridhara", "wari", "lalbagh", "shahbagh", "malibagh", "mogbazar", "moghbazar", "demra", "kafrul", "cantonment", "khilkhet", "adabor", "hazaribagh", "kamrangirchar", "sutrapur", "kotwali dhaka", "ধানমন্ডি", "গুলশান", "বনানী", "উত্তরা", "মোহাম্মদপুর", "বাড্ডা", "রামপুরা", "খিলগাঁও", "মতিঝিল", "তেজগাঁও", "ফার্মগেট", "শ্যামলী", "যাত্রাবাড়ী", "পল্লবী", "বসুন্ধরা", "মালিবাগ", "মগবাজার"];
const CHATTOGRAM_AREAS = ["chittagong", "ctg", "agrabad", "halishahar", "pahartali", "panchlaish", "chawkbazar", "bahaddarhat", "nasirabad", "khulshi", "চিটাগাং", "আগ্রাবাদ", "হালিশহর", "পাহাড়তলী"];
const ALIASES = new Map([
  ...DHAKA_AREAS.map(name => [name, "47"]), ...CHATTOGRAM_AREAS.map(name => [name, "8"]),
  ["cumilla", "1"], ["cox s bazar", "9"], ["coxs bazar", "9"], ["bogra", "14"], ["jessore", "20"], ["barishal", "33"],
  ["chapai nawabganj", "18"], ["chapai", "18"], ["চাঁপাই", "18"], ["চাঁপাই নবাবগঞ্জ", "18"], ["rajshahi city", "15"],
].map(([name, id]) => [normalized(name), id]));
const byId = new Map(locations.districts.map(district => [district.id, district]));
// District spellings and filler words that name no place below the district.
const DISTRICT_SPELLINGS = new Map([
  ["chittagong", "8"], ["ctg", "8"], ["চিটাগাং", "8"], ["cumilla", "1"], ["cox s bazar", "9"], ["coxs bazar", "9"], ["bogra", "14"],
  ["jessore", "20"], ["barishal", "33"], ["chapai nawabganj", "18"], ["chapai", "18"], ["চাঁপাই", "18"], ["চাঁপাই নবাবগঞ্জ", "18"],
].map(([name, id]) => [normalized(name), id]));
const FILLER_WORDS = new Set(["bangladesh", "bd", "sadar", "sodor", "sader", "shodor", "zila", "zilla", "jela", "jila", "district", "city", "বাংলাদেশ", "সদর", "জেলা", "শহর"].map(normalized));
const withoutPhrase = (text, phrase) => {
  let result = ` ${text} `;
  while (result.includes(` ${phrase} `)) result = result.replace(` ${phrase} `, " ");
  return result.trim();
};

// A courier can deliver to "village, upazila, district" without house or road
// words, so a named district plus any other place counts as a full address.
function hasLocalityWithDistrict(address) {
  // "Manikgonj" and "Kishorganj" are common spellings of Manikganj and Kishoreganj.
  const text = address.replace(/gonj\b/g, "ganj").replace(/\bkishorganj\b/g, "kishoreganj");
  const named = [];
  for (const district of locations.districts) {
    for (const name of [district.name, district.bnName]) if (contains(text, name)) named.push([normalized(name), district.id]);
  }
  for (const [name, id] of DISTRICT_SPELLINGS) if (contains(text, name)) named.push([name, id]);
  if (!named.length) return false;
  const namedIds = new Set(named.map(([, id]) => id));
  let rest = text;
  for (const [name, id] of named) {
    // "Sherpur, Bogura": Sherpur is also an upazila of Bogura, so it is the locality.
    const upazilaOfOther = locations.upazilas.some(row => row.districtId !== id && namedIds.has(row.districtId)
      && (normalized(row.name) === name || normalized(row.bnName) === name));
    if (!upazilaOfOther) rest = withoutPhrase(rest, name);
  }
  return rest.split(" ").some(word => word.length >= 3 && !FILLER_WORDS.has(word));
}

export function parseBdLocation(address) {
  const text = normalized(address);
  const ids = new Set(locations.districts.filter(district => contains(text, district.name) || contains(text, district.bnName)).map(district => district.id));
  for (const [alias, id] of ALIASES) if (contains(text, alias)) ids.add(id);
  // An upazila name shared by several districts (Durgapur, Shibganj, Nawabganj)
  // is never enough evidence on its own.
  if (!ids.size) {
    const districts = new Set(locations.upazilas.filter(row => contains(text, row.name) || contains(text, row.bnName)).map(row => row.districtId));
    if (districts.size === 1) ids.add([...districts][0]);
  }
  const district = ids.size === 1 ? byId.get([...ids][0]) : null;
  const hasPlaceMarker = /\p{N}/u.test(text) || dictionary.placeMarkers.some(marker => contains(text, marker));
  return {
    districtId: district?.id || null,
    districtName: district?.name || null,
    hasPlaceMarker,
    hasArea: Boolean(district || ids.size > 1 || text.length >= 20),
    hasLocality: hasLocalityWithDistrict(text),
  };
}
