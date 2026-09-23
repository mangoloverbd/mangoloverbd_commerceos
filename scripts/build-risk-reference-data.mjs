// MIT geography: nuhil/bangladesh-geocode@5622f68bd07a98e076edcf8100bf0db6a75b9854.
// Network ranges: iptoasn.com (public domain). Run manually for a quarterly refresh.
import { writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

const directory = new URL("../server/risk/dictionaries/", import.meta.url);
const revision = "5622f68bd07a98e076edcf8100bf0db6a75b9854";

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`Reference download failed: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

const geographies = {};
for (const name of ["divisions", "districts", "upazilas"]) {
  const source = JSON.parse((await download(`https://raw.githubusercontent.com/nuhil/bangladesh-geocode/${revision}/${name}/${name}.json`)).toString());
  const rows = source.find(row => row.type === "table")?.data;
  if (!Array.isArray(rows)) throw new Error(`Invalid ${name} reference`);
  geographies[name] = rows.map(({ id, division_id, district_id, name: english, bn_name }) => ({
    id, ...(division_id ? { divisionId: division_id } : {}), ...(district_id ? { districtId: district_id } : {}), name: english.trim(), bnName: bn_name.trim(),
  }));
}
if (geographies.divisions.length !== 8 || geographies.districts.length !== 64 || geographies.upazilas.length !== 494) {
  throw new Error("Unexpected geography row counts");
}
await writeFile(new URL("bdLocations.json", directory), `${JSON.stringify(geographies)}\n`);

const networks = { source: "iptoasn.com", ranges: { v4: [], v6: [] } };
for (const family of ["v4", "v6"]) {
  const compressed = await download(`https://iptoasn.com/data/ip2asn-${family}.tsv.gz`);
  const lines = gunzipSync(compressed).toString().split("\n");
  for (const line of lines) {
    if (!line) continue;
    const [start, end, asn, country] = line.split("\t");
    if (country === "BD" && /^\d+$/.test(asn)) networks.ranges[family].push([start, end, Number(asn)]);
  }
  if (networks.ranges[family].length === 0) throw new Error(`No BD ${family} networks`);
}
await writeFile(new URL("bdNetworks.json", directory), `${JSON.stringify(networks)}\n`);
console.log(`Pinned ${geographies.districts.length} districts and ${networks.ranges.v4.length} v4 BD ranges`);
