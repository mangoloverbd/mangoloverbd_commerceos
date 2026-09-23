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

async function addSet(redis, key, member, ttl) {
  if (!key || !member) return;
  await redis.sadd(key, member);
  await redis.expire(key, ttl);
}

export async function recordIdentityLinks(redis, ctx, { countAttempt = true } = {}) {
  if (!redis) throw new Error("Risk Redis unavailable");
  const k = keys(ctx);
  const { phone, device, fingerprint, network } = ctx.hashes;
  await addSet(redis, k.devicePhones, phone, WEEK);
  await addSet(redis, k.fingerprintPhones, phone, WEEK);
  await addSet(redis, k.phoneDevices, device, WEEK);
  if (k.deviceNetworks && network) {
    await redis.zadd(k.deviceNetworks, { score: ctx.now, member: network });
    await redis.zremrangebyscore(k.deviceNetworks, 0, ctx.now - HOUR * 1000);
    await redis.expire(k.deviceNetworks, DAY);
  }
  if (ctx.network.type !== "mobile") await addSet(redis, k.networkPhones, phone, DAY);
  if (countAttempt) {
    for (const [key, ttl] of [[k.phone15m, 900], [k.phone24h, DAY], [k.device15m, 900]]) {
      if (!key) continue;
      const count = Number(await redis.incr(key));
      if (count === 1) await redis.expire(key, ttl);
    }
  }
}

export async function readIdentityCounts(redis, ctx) {
  if (!redis) throw new Error("Risk Redis unavailable");
  const k = keys(ctx);
  const count = async (key, method) => key ? Number(await redis[method](key)) || 0 : 0;
  return {
    links: {
      devicePhones7d: await count(k.devicePhones, "scard"),
      phoneDevices7d: await count(k.phoneDevices, "scard"),
      deviceNetworks1h: await count(k.deviceNetworks, "zcard"),
      networkPhones24h: ctx.network.type === "mobile" ? 0 : await count(k.networkPhones, "scard"),
    },
    attempts: {
      phone15m: await count(k.phone15m, "get"),
      phone24h: await count(k.phone24h, "get"),
      device15m: await count(k.device15m, "get"),
    },
  };
}
