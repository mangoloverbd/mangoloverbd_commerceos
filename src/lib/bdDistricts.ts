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
  { name: "Brahmanbaria", match: ["brahmanbaria", "ব্রাহ্মণবাড়িয়া"] },
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
  { name: "Gopalganj", match: ["gopalganj", "গোপালগঞ্জ"] },
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
  { name: "Narayanganj", match: ["narayanganj", "নারায়ণগঞ্জ"] },
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
  { name: "Sirajganj", match: ["sirajganj", "সিরাজগঞ্জ"] },
  { name: "Sunamganj", match: ["sunamganj", "সুনামগঞ্জ"] },
  { name: "Sylhet", match: ["sylhet", "সিলেট"] },
  { name: "Tangail", match: ["tangail", "টাঙ্গাইল"] },
  { name: "Thakurgaon", match: ["thakurgaon", "ঠাকুরগাঁও"] },
];

const DISTRICT_AREA_ALIASES: Record<string, string> = {
  dhanmondi: "Dhaka",
  gulshan: "Dhaka",
  banani: "Dhaka",
  mirpur: "Dhaka",
  mohammadpur: "Dhaka",
  uttara: "Dhaka",
  badda: "Dhaka",
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
  savar: "Dhaka",
  dhamrai: "Dhaka",
  ashulia: "Dhaka",
  shantinagar: "Dhaka",
  malibagh: "Dhaka",
  moghbazar: "Dhaka",
  tongi: "Gazipur",
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
};

export function normalizeAddress(value: string | null | undefined): string {
  return (value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function detectDistrict(
  address: string | null | undefined,
  learnedAliases: Record<string, string | null> = {},
): string | null {
  const normalized = normalizeAddress(address);
  if (!normalized) return null;
  if (Object.hasOwn(learnedAliases, normalized)) return learnedAliases[normalized];
  for (const district of BD_DISTRICTS) {
    if (district.match.some((variant) => normalized.includes(variant))) return district.name;
  }
  for (const [area, districtName] of Object.entries(DISTRICT_AREA_ALIASES)) {
    if (normalized.includes(area)) return districtName;
  }
  return null;
}
