export function computeAccuracy(attempts, { now = new Date(), days = 7 } = {}) {
  if (![7, 30].includes(days)) throw new TypeError("Invalid accuracy window");
  const since = now.getTime() - days * 86_400_000;
  const rows = attempts.filter(row => {
    const timestamp = Date.parse(row.created_at);
    return Number.isFinite(timestamp) && timestamp >= since && timestamp <= now.getTime();
  });
  const count = (predicate) => rows.filter(predicate).length;
  const fake = rows.filter(row => row.label === "fake");
  const genuine = rows.filter(row => row.label === "genuine");
  const blocked = rows.filter(row => row.decision === "BLOCK" && (row.label === "fake" || row.label === "genuine"));
  const caught = fake.filter(row => row.decision !== "ALLOW").length;
  const bySignal = new Map();
  for (const row of rows) {
    for (const code of new Set((Array.isArray(row.signals) ? row.signals : []).map(signal => signal?.code).filter(Boolean))) {
      const counts = bySignal.get(code) || { code, fired: 0, fake: 0, genuine: 0 };
      counts.fired++;
      if (row.label === "fake" || row.label === "genuine") counts[row.label]++;
      bySignal.set(code, counts);
    }
  }
  return {
    overall: {
      attempts: rows.length, holds: count(row => row.decision === "HOLD"), blocks: count(row => row.decision === "BLOCK"),
      holdRate: rows.length ? count(row => row.decision === "HOLD") / rows.length : null,
      labelledFake: fake.length, labelledGenuine: genuine.length,
      blockedGenuine: genuine.filter(row => row.decision === "BLOCK").length,
      heldGenuine: genuine.filter(row => row.decision === "HOLD").length,
      blockPrecision: blocked.length ? blocked.filter(row => row.label === "fake").length / blocked.length : null,
      fakeCaught: fake.length ? caught / fake.length : null, fakeSlipped: fake.length - caught,
      targets: {
        blockPrecision: { value: blocked.length ? blocked.filter(row => row.label === "fake").length / blocked.length : null, target: 0.97, pass: blocked.length ? blocked.filter(row => row.label === "fake").length / blocked.length >= 0.97 : null },
        holdRate: { value: rows.length ? count(row => row.decision === "HOLD") / rows.length : null, target: 0.15, pass: rows.length ? count(row => row.decision === "HOLD") / rows.length <= 0.15 : null },
        fakeCaught: { value: fake.length ? caught / fake.length : null, target: 0.70, pass: fake.length ? caught / fake.length >= 0.70 : null },
      },
    },
    signals: [...bySignal.values()].map(row => ({ ...row, precisionFake: row.fake + row.genuine ? row.fake / (row.fake + row.genuine) : null })).sort((a, b) => b.fired - a.fired),
  };
}
