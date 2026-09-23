import locations from "./dictionaries/bdLocations.json" with { type: "json" };
import abuse from "./dictionaries/abuse.json" with { type: "json" };

const normalized = value => String(value || "").normalize("NFC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const contains = (text, value) => value && (` ${text} `).includes(` ${normalized(value)} `);
const aliases = new Map([["dhanmondi", "47"], ["ধানমন্ডি", "47"], ["chittagong", "8"], ["চিটাগাং", "8"], ["bogura", "14"]]);

export function parseBdLocation(address) {
  const text = normalized(address);
  const matches = locations.districts.filter(district => contains(text, district.name) || contains(text, district.bnName));
  for (const [alias, id] of aliases) {
    if (contains(text, alias) && !matches.some(district => district.id === id)) {
      const district = locations.districts.find(row => row.id === id);
      if (district) matches.push(district);
    }
  }
  // A place shared by multiple districts is never sufficient evidence by itself.
  if (!matches.length) {
    const matchedUpazilas = locations.upazilas.filter(row => contains(text, row.name) || contains(text, row.bnName));
    const districts = new Set(matchedUpazilas.map(row => row.districtId));
    if (districts.size === 1 && matchedUpazilas.length) {
      const district = locations.districts.find(row => row.id === matchedUpazilas[0].districtId);
      if (district) matches.push(district);
    }
  }
  const district = matches.length === 1 ? matches[0] : null;
  const hasPlaceMarker = abuse.placeMarkers.some(marker => contains(text, marker));
  return { districtId: district?.id || null, districtName: district?.name || null, hasPlaceMarker, hasArea: Boolean(district || text.length >= 20) };
}
