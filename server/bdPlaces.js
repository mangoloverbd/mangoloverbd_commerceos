// Approximate district-town coordinates for Bangladesh, used to place visits that
// have a city name but no stored coordinates (visits recorded before 2026-10-06).
// City level only — good enough for a pin on a globe, never an address.
const PLACES = [
  [["dhaka"], 23.81, 90.41], [["gazipur", "tongi"], 24.0, 90.42], [["narayanganj"], 23.62, 90.5],
  [["savar"], 23.85, 90.26], [["narsingdi"], 23.92, 90.72], [["munshiganj"], 23.54, 90.53],
  [["manikganj"], 23.86, 90.0], [["tangail"], 24.25, 89.92], [["kishoreganj"], 24.43, 90.78],
  [["faridpur"], 23.61, 89.84], [["madaripur"], 23.17, 90.2], [["gopalganj"], 23.01, 89.83],
  [["rajbari"], 23.76, 89.64], [["shariatpur"], 23.21, 90.35],
  [["chattogram", "chittagong"], 22.36, 91.78], [["coxsbazar"], 21.43, 92.01], [["cumilla", "comilla"], 23.46, 91.18],
  [["feni"], 23.02, 91.4], [["noakhali", "maijdee"], 22.87, 91.1], [["lakshmipur", "laxmipur"], 22.94, 90.83],
  [["chandpur"], 23.23, 90.67], [["brahmanbaria"], 23.96, 91.11], [["rangamati"], 22.65, 92.18],
  [["khagrachhari", "khagrachari"], 23.12, 91.98], [["bandarban"], 22.2, 92.22],
  [["rajshahi"], 24.37, 88.6], [["chapainawabganj", "nawabganj"], 24.6, 88.27], [["naogaon"], 24.79, 88.93],
  [["natore"], 24.41, 89.0], [["bogura", "bogra"], 24.85, 89.37], [["joypurhat"], 25.1, 89.02],
  [["pabna"], 24.01, 89.23], [["sirajganj"], 24.45, 89.7],
  [["khulna"], 22.82, 89.55], [["jashore", "jessore"], 23.17, 89.21], [["satkhira"], 22.72, 89.07],
  [["bagerhat"], 22.65, 89.79], [["kushtia"], 23.9, 89.12], [["jhenaidah"], 23.54, 89.17],
  [["magura"], 23.49, 89.42], [["narail"], 23.17, 89.51], [["chuadanga"], 23.64, 88.84], [["meherpur"], 23.76, 88.63],
  [["barishal", "barisal"], 22.7, 90.37], [["patuakhali"], 22.36, 90.33], [["bhola"], 22.69, 90.65],
  [["pirojpur"], 22.58, 89.97], [["jhalokati", "jhalakathi"], 22.64, 90.2], [["barguna"], 22.15, 90.12],
  [["sylhet"], 24.89, 91.87], [["moulvibazar", "maulvibazar"], 24.48, 91.78], [["habiganj"], 24.38, 91.42],
  [["sunamganj"], 25.07, 91.4],
  [["rangpur"], 25.74, 89.25], [["dinajpur"], 25.63, 88.64], [["thakurgaon"], 26.03, 88.46],
  [["panchagarh"], 26.34, 88.55], [["nilphamari", "saidpur"], 25.93, 88.86], [["lalmonirhat"], 25.92, 89.45],
  [["kurigram"], 25.81, 89.64], [["gaibandha"], 25.33, 89.53],
  [["mymensingh"], 24.75, 90.41], [["jamalpur"], 24.92, 89.95], [["sherpur"], 25.02, 90.02], [["netrokona", "netrakona"], 24.88, 90.73],
];

const byKey = new Map(PLACES.flatMap(([names, latitude, longitude]) => names.map((name) => [name, { latitude, longitude }])));

const placeKey = (value) => String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");

export function bdPlaceCoordinates(name) {
  const key = placeKey(name);
  return key ? byKey.get(key) ?? null : null;
}

// Stored coordinates win; otherwise a Bangladeshi city name is looked up.
export function visitorLocation({ city, country, latitude, longitude }) {
  const lat = latitude == null ? NaN : Number(latitude);
  const lon = longitude == null ? NaN : Number(longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { latitude: lat, longitude: lon };
  if (country && country !== "BD") return null;
  return bdPlaceCoordinates(city);
}
