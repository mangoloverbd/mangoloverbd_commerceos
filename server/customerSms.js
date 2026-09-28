export const MAX_CUSTOMER_SMS_RECIPIENTS = 500;

const NAME_TOKEN = /\{\{\s*customer_name\s*\}\}/g;
const FALLBACK_NAME = "গ্রাহক";

/**
 * Resolves selected customer ids against the server-built customer list, so a client can
 * only message people who actually ordered from this workspace. One SMS per phone number.
 */
export function planCustomerSms({ customers, customerIds, message, normalizePhone }) {
  const byId = new Map(customers.map((customer) => [customer.id, customer]));
  const seenPhones = new Set();
  const recipients = [];
  let skipped = 0;

  for (const id of new Set(customerIds)) {
    const customer = byId.get(id);
    const phone = customer ? normalizePhone(customer.phone) : null;
    if (!phone) {
      skipped += 1;
      continue;
    }
    if (seenPhones.has(phone)) continue;
    seenPhones.add(phone);
    const name = String(customer.name || "").trim();
    const displayName = name && name.toLowerCase() !== "unknown" ? name : FALLBACK_NAME;
    recipients.push({ phone, message: message.replace(NAME_TOKEN, displayName) });
  }

  return { recipients, skipped };
}

export async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}
