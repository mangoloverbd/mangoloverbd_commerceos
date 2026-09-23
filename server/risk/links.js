const WEEK = 604800;
const DAY = 86400;
const HOUR = 3600;

function keys(ctx) {
  const prefix = `op2:${ctx.orgId}`;
  const { phone, device, fingerprint, network } = ctx.hashes;
  return {
    devicePhones: device ? `${prefix}:dev:phones:${device}` : null,
    fingerprintPhones: fingerprint ? `${prefix}:fp:phones:${fingerprint}` : null,
    phoneDevices: phone ? `${prefix}:phone:devs:${phone}` : null,
    deviceNetworks: device ? `${prefix}:dev:nets:${device}` : null,
    networkPhones: network ? `${prefix}:net:phones:${network}` : null,
    phone15m: phone ? `${prefix}:cnt:phone:15m:${phone}` : null,
    phone24h: phone ? `${prefix}:cnt:phone:24h:${phone}` : null,
    device15m: device ? `${prefix}:cnt:dev:15m:${device}` : null,
  };
}

// Sorted sets scored by time give a true sliding window: members older than the
// window are pruned, so a shared family device is not penalized for old orders.
async function addWindowed(redis, key, member, windowSeconds, now) {
  if (!key || !member) return;
  await redis.zadd(key, { score: now, member });
  await redis.zremrangebyscore(key, 0, now - windowSeconds * 1000);
  await redis.expire(key, windowSeconds);
}

async function countWindowed(redis, key, windowSeconds, now) {
  if (!key) return 0;
  return Number(await redis.zcount(key, now - windowSeconds * 1000, "+inf")) || 0;
}

export async function recordIdentityLinks(redis, ctx, { countAttempt = true } = {}) {
  // Without Redis there is nothing to write: the persisted attempt row is the
  // record, and readIdentityCounts derives every counter from it.
  if (!redis) return;
  const k = keys(ctx);
  const { phone, device, network } = ctx.hashes;
  const tasks = [
    addWindowed(redis, k.devicePhones, phone, WEEK, ctx.now),
    addWindowed(redis, k.fingerprintPhones, phone, WEEK, ctx.now),
    addWindowed(redis, k.phoneDevices, device, WEEK, ctx.now),
    addWindowed(redis, k.deviceNetworks, network, HOUR, ctx.now),
  ];
  // Mobile carrier NAT puts thousands of customers behind one network.
  if (ctx.network.type !== "mobile") tasks.push(addWindowed(redis, k.networkPhones, phone, DAY, ctx.now));
  if (countAttempt) {
    for (const [key, ttl] of [[k.phone15m, 900], [k.phone24h, DAY], [k.device15m, 900]]) {
      if (!key) continue;
      // Create the window with its TTL first; INCR keeps the TTL, so a counter
      // can never become permanent if a later call fails.
      tasks.push((async () => {
        await redis.set(key, 0, { nx: true, ex: ttl });
        await redis.incr(key);
      })());
    }
  }
  await Promise.all(tasks);
}

// Supabase fallback: derive the same counters from persisted attempt rows when
// Redis is not configured. Row counts include the in-flight attempt (+1) and
// distinct sets include its identities, matching Redis semantics where the
// current order was recorded before counting.
async function readSqlCounts(supabase, ctx) {
  const { phone, device, network } = ctx.hashes;
  const since = seconds => new Date(ctx.now - seconds * 1000).toISOString();
  const scoped = () => supabase.from("order_risk_attempts").eq("org_id", ctx.orgId);
  const countRows = async build => {
    const { count, error } = await build(scoped().select("id", { count: "exact", head: true }));
    if (error) throw error;
    return count || 0;
  };
  const distinctCount = async (column, build, current) => {
    const { data, error } = await build(scoped().select(column).limit(1000));
    if (error) throw error;
    const values = new Set((data || []).map(row => row?.[column]).filter(Boolean));
    if (current) values.add(current);
    return values.size;
  };
  const [phone15m, phone24h, device15m, devicePhones7d, phoneDevices7d, deviceNetworks1h, networkPhones24h] = await Promise.all([
    countRows(query => query.eq("phone_hash", phone).gte("created_at", since(900))),
    countRows(query => query.eq("phone_hash", phone).gte("created_at", since(DAY))),
    device ? countRows(query => query.eq("device_hash", device).gte("created_at", since(900))) : 0,
    device ? distinctCount("phone_hash", query => query.eq("device_hash", device).gte("created_at", since(WEEK)), phone) : 0,
    distinctCount("device_hash", query => query.eq("phone_hash", phone).gte("created_at", since(WEEK)), device),
    device ? distinctCount("network_hash", query => query.eq("device_hash", device).gte("created_at", since(HOUR)), network) : 0,
    // Mobile carrier NAT puts thousands of customers behind one network.
    ctx.network.type === "mobile" || !network ? 0 : distinctCount("phone_hash", query => query.eq("network_hash", network).gte("created_at", since(DAY)), phone),
  ]);
  return {
    links: { devicePhones7d, phoneDevices7d, deviceNetworks1h, networkPhones24h },
    attempts: { phone15m: phone15m + 1, phone24h: phone24h + 1, device15m: device ? device15m + 1 : 0 },
  };
}

export async function readIdentityCounts(redis, ctx, { supabase } = {}) {
  if (redis) {
    const k = keys(ctx);
    const get = async key => (key ? Number(await redis.get(key)) || 0 : 0);
    const [devicePhones7d, phoneDevices7d, deviceNetworks1h, networkPhones24h, phone15m, phone24h, device15m] = await Promise.all([
      countWindowed(redis, k.devicePhones, WEEK, ctx.now),
      countWindowed(redis, k.phoneDevices, WEEK, ctx.now),
      countWindowed(redis, k.deviceNetworks, HOUR, ctx.now),
      ctx.network.type === "mobile" ? 0 : countWindowed(redis, k.networkPhones, DAY, ctx.now),
      get(k.phone15m),
      get(k.phone24h),
      get(k.device15m),
    ]);
    return {
      links: { devicePhones7d, phoneDevices7d, deviceNetworks1h, networkPhones24h },
      attempts: { phone15m, phone24h, device15m },
    };
  }
  if (supabase) return readSqlCounts(supabase, ctx);
  throw new Error("Risk store unavailable");
}
