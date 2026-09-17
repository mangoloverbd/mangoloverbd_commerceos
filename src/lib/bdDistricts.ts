export interface BdDistrict {
  name: string;
  match: string[];
}

export const DISTRICT_UNKNOWN_SENTINEL = "__unknown__";

export const BD_DISTRICTS: BdDistrict[] = [
  { name: "Bagerhat", match: ["bagerhat", "বাগেরহাট"] },
  { name: "Bandarban", match: ["bandarban", "বান্দরবান"] },
  { name: "Barguna", match: ["barguna", "বরগুনা"] },
  { name: "Barishal", match: ["barishal", "barisal", "বরিশাল"] },
  { name: "Bhola", match: ["bhola", "ভোলা"] },
  { name: "Bogura", match: ["bogura", "bogra", "বগুড়া"] },
  { name: "Brahmanbaria", match: ["brahmanbaria", "ব্রাহ্মণবাড়িয়া", "বিবাড়িয়া", "বিবাড়ীয়া", "বীবাড়িয়া", "bbaria", "b baria"] },
  { name: "Chandpur", match: ["chandpur", "চাঁদপুর"] },
  { name: "Chapai Nawabganj", match: ["chapai nawabganj", "chapainawabganj", "nawabganj", "চাঁপাইনবাবগঞ্জ"] },
  { name: "Chattogram", match: ["chattogram", "chittagong", "চট্টগ্রাম"] },
  { name: "Chuadanga", match: ["chuadanga", "চুয়াডাঙ্গা"] },
  { name: "Cox's Bazar", match: ["cox's bazar", "coxs bazar", "cox bazar", "কক্সবাজার"] },
  { name: "Cumilla", match: ["cumilla", "comilla", "কুমিল্লা"] },
  { name: "Dhaka", match: ["dhaka", "ঢাকা"] },
  { name: "Dinajpur", match: ["dinajpur", "দিনাজপুর"] },
  { name: "Faridpur", match: ["faridpur", "ফরিদপুর"] },
  { name: "Feni", match: ["feni", "ফেনী"] },
  { name: "Gaibandha", match: ["gaibandha", "গাইবান্ধা"] },
  { name: "Gazipur", match: ["gazipur", "গাজীপুর"] },
  { name: "Gopalganj", match: ["gopalganj", "gopalgonj", "গোপালগঞ্জ"] },
  { name: "Habiganj", match: ["habiganj", "হবিগঞ্জ"] },
  { name: "Jamalpur", match: ["jamalpur", "জামালপুর"] },
  { name: "Jashore", match: ["jashore", "jessore", "যশোর"] },
  { name: "Jhalokati", match: ["jhalokati", "ঝালকাঠি"] },
  { name: "Jhenaidah", match: ["jhenaidah", "ঝিনাইদহ"] },
  { name: "Joypurhat", match: ["joypurhat", "জয়পুরহাট"] },
  { name: "Khagrachari", match: ["khagrachari", "খাগড়াছড়ি"] },
  { name: "Khulna", match: ["khulna", "খুলনা"] },
  { name: "Kishoreganj", match: ["kishoreganj", "কিশোরগঞ্জ"] },
  { name: "Kurigram", match: ["kurigram", "কুড়িগ্রাম"] },
  { name: "Kushtia", match: ["kushtia", "কুষ্টিয়া"] },
  { name: "Lakshmipur", match: ["lakshmipur", "লক্ষ্মীপুর"] },
  { name: "Lalmonirhat", match: ["lalmonirhat", "লালমনিরহাট"] },
  { name: "Madaripur", match: ["madaripur", "মাদারীপুর"] },
  { name: "Magura", match: ["magura", "মাগুরা"] },
  { name: "Manikganj", match: ["manikganj", "মানিকগঞ্জ"] },
  { name: "Meherpur", match: ["meherpur", "মেহেরপুর"] },
  { name: "Moulvibazar", match: ["moulvibazar", "মৌলভীবাজার"] },
  { name: "Munshiganj", match: ["munshiganj", "মুন্সিগঞ্জ"] },
  { name: "Mymensingh", match: ["mymensingh", "ময়মনসিংহ"] },
  { name: "Naogaon", match: ["naogaon", "নওগাঁ"] },
  { name: "Narail", match: ["narail", "নড়াইল"] },
  { name: "Narayanganj", match: ["narayanganj", "narayangonj", "narayanrgonj", "নারায়ণগঞ্জ", "নারায়নগঞ্জ"] },
  { name: "Narsingdi", match: ["narsingdi", "নরসিংদী"] },
  { name: "Natore", match: ["natore", "নাটোর"] },
  { name: "Netrokona", match: ["netrokona", "নেত্রকোণা"] },
  { name: "Nilphamari", match: ["nilphamari", "নীলফামারী"] },
  { name: "Noakhali", match: ["noakhali", "নোয়াখালী"] },
  { name: "Pabna", match: ["pabna", "পাবনা"] },
  { name: "Panchagarh", match: ["panchagarh", "পঞ্চগড়"] },
  { name: "Patuakhali", match: ["patuakhali", "পটুয়াখালী"] },
  { name: "Pirojpur", match: ["pirojpur", "পিরোজপুর"] },
  { name: "Rajbari", match: ["rajbari", "রাজবাড়ী"] },
  { name: "Rajshahi", match: ["rajshahi", "রাজশাহী"] },
  { name: "Rangamati", match: ["rangamati", "রাঙ্গামাটি"] },
  { name: "Rangpur", match: ["rangpur", "রংপুর"] },
  { name: "Satkhira", match: ["satkhira", "সাতক্ষীরা"] },
  { name: "Shariatpur", match: ["shariatpur", "শরীয়তপুর"] },
  { name: "Sherpur", match: ["sherpur", "শেরপুর"] },
  { name: "Sirajganj", match: ["sirajganj", "sirajgonj", "সিরাজগঞ্জ"] },
  { name: "Sunamganj", match: ["sunamganj", "সুনামগঞ্জ"] },
  { name: "Sylhet", match: ["sylhet", "সিলেট"] },
  { name: "Tangail", match: ["tangail", "টাঙ্গাইল"] },
  { name: "Thakurgaon", match: ["thakurgaon", "ঠাকুরগাঁও"] },
];

const DISTRICT_AREA_ALIASES: Record<string, string> = {
  dhanmondi: "Dhaka",
  ধানমন্ডি: "Dhaka",
  gulshan: "Dhaka",
  গুলশান: "Dhaka",
  banani: "Dhaka",
  mirpur: "Dhaka",
  মিরপুর: "Dhaka",
  mohammadpur: "Dhaka",
  মোহাম্মদপুর: "Dhaka",
  uttara: "Dhaka",
  উত্তরা: "Dhaka",
  badda: "Dhaka",
  বাড্ডা: "Dhaka",
  বাড্ডা: "Dhaka",
  khilgaon: "Dhaka",
  motijheel: "Dhaka",
  paltan: "Dhaka",
  farmgate: "Dhaka",
  shahbagh: "Dhaka",
  tejgaon: "Dhaka",
  rampura: "Dhaka",
  bashundhara: "Dhaka",
  mohakhali: "Dhaka",
  banasree: "Dhaka",
  jatrabari: "Dhaka",
  demra: "Dhaka",
  keraniganj: "Dhaka",
  কেরানীগঞ্জ: "Dhaka",
  savar: "Dhaka",
  সাভার: "Dhaka",
  dhamrai: "Dhaka",
  ashulia: "Dhaka",
  shantinagar: "Dhaka",
  malibagh: "Dhaka",
  moghbazar: "Dhaka",
  kamrangirchar: "Dhaka",
  কামরাঙ্গীরচর: "Dhaka",
  tongi: "Gazipur",
  টঙ্গী: "Gazipur",
  টংগী: "Gazipur",
  kaliakair: "Gazipur",
  sreepur: "Gazipur",
  sonargaon: "Narayanganj",
  rupganj: "Narayanganj",
  araihazar: "Narayanganj",
  agrabad: "Chattogram",
  gec: "Chattogram",
  halishahar: "Chattogram",
  hathazari: "Chattogram",
  patiya: "Chattogram",
  zindabazar: "Sylhet",
  ambarkhana: "Sylhet",
  puthia: "Rajshahi",
  পুঠিয়া: "Rajshahi",
  kashinathpur: "Pabna",
  কাশিনাথপুর: "Pabna",
};

// Bengali input varies by keyboard: "য়" is sometimes U+09DF and sometimes a
// য+nukta sequence, and phones insert ZWJ/ZWNJ inside words. Fold both sides
// identically so matching never depends on which encoding was typed.
function foldUnicode(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\u200C|\u200D|\uFEFF/g, "")
    .replace(/\u09DF/g, "\u09AF");
}

function normalizeText(value: string): string {
  return foldUnicode(value.toLowerCase()).replace(/\s+/g, " ").trim();
}

function spaceless(value: string): string {
  return normalizeText(value).replace(/\s+/g, "");
}

interface MatchIndex {
  name: string;
  spaced: string[];
  flat: string[];
}

const DISTRICT_INDEX: MatchIndex[] = BD_DISTRICTS.map((district) => ({
  name: district.name,
  spaced: district.match.map(normalizeText),
  flat: district.match.map(spaceless),
}));

const AREA_INDEX: MatchIndex[] = Object.entries(DISTRICT_AREA_ALIASES).map(([area, name]) => ({
  name,
  spaced: [normalizeText(area)],
  flat: [spaceless(area)],
}));

function matchIndex(index: MatchIndex[], text: string, flat: string): string | null {
  for (const entry of index) {
    if (entry.spaced.some((variant) => variant && text.includes(variant))) return entry.name;
  }
  for (const entry of index) {
    if (entry.flat.some((variant) => variant && variant.length >= 4 && flat.includes(variant))) return entry.name;
  }
  return null;
}

export function normalizeAddress(value: string | null | undefined): string {
  return (value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function detectDistrict(
  address: string | null | undefined,
  learnedAliases: Record<string, string | null> = {},
): string | null {
  const key = normalizeAddress(address);
  if (!key) return null;
  if (Object.hasOwn(learnedAliases, key)) return learnedAliases[key];
  const text = normalizeText(address || "");
  const flat = text.replace(/\s+/g, "");
  // Explicit district names win over area aliases: an address naming two
  // districts keeps the explicitly named one, not an area guess.
  return matchIndex(DISTRICT_INDEX, text, flat) ?? matchIndex(AREA_INDEX, text, flat);
}
