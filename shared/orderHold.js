const REASONS = [
  { code: "customer_requested_after_date", label: "গ্রাহক নির্দিষ্ট তারিখের পরে পার্সেল নিতে চান", requiresReturnDate: true },
  { code: "contact_later", label: "গ্রাহক পরে যোগাযোগ করতে বলেছেন", requiresReturnDate: false },
  { code: "awaiting_customer_confirmation", label: "গ্রাহকের নিশ্চিতকরণের অপেক্ষায়", requiresReturnDate: false },
  { code: "contact_details_change", label: "ঠিকানা বা ফোন নম্বর সংশোধনের অপেক্ষায়", requiresReturnDate: false },
  { code: "order_change_requested", label: "অর্ডার পরিবর্তনের অনুরোধ", requiresReturnDate: false },
  { code: "payment_confirmation_pending", label: "পেমেন্ট নিশ্চিতকরণের অপেক্ষায়", requiresReturnDate: false },
  { code: "advance_payment_pending", label: "অগ্রিম পেমেন্টের জন্য অর্ডার হোল্ডে রাখা হয়েছে", requiresReturnDate: false },
  { code: "temporarily_out_of_stock", label: "পণ্য সাময়িকভাবে স্টকে নেই", requiresReturnDate: false },
  { code: "courier_delivery_issue", label: "কুরিয়ার/ডেলিভারি সমস্যা", requiresReturnDate: false },
  { code: "other", label: "অন্যান্য", requiresReturnDate: false },
];

export const ORDER_HOLD_REASONS = Object.freeze(REASONS.map((reason) => Object.freeze(reason)));

const REASON_BY_CODE = new Map(ORDER_HOLD_REASONS.map((reason) => [reason.code, reason]));
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REASON_DETAIL_LENGTH = 250;

function isValidDateKey(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function getBangladeshDateKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(value.getTime())) throw new TypeError("A valid date is required");
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function validateOrderHoldDetails({
  reasonCode,
  reasonDetail = "",
  holdUntilDate = null,
  currentDate = getBangladeshDateKey(),
} = {}) {
  if (typeof reasonCode !== "string" || !reasonCode.trim()) {
    return { code: "hold_reason_required", error: "Choose a hold reason" };
  }
  const reason = REASON_BY_CODE.get(reasonCode);
  if (!reason) return { code: "invalid_hold_reason", error: "Choose a valid hold reason" };
  if (typeof reasonDetail !== "string") {
    return { code: "invalid_hold_reason_detail", error: "Hold reason detail must be text" };
  }
  const detail = reasonDetail.trim();
  if (reason.code !== "other" && detail) {
    return { code: "hold_detail_not_allowed", error: "Details are only allowed for Other" };
  }
  if (detail.length > MAX_REASON_DETAIL_LENGTH) {
    return { code: "hold_reason_detail_too_long", error: `Hold details cannot exceed ${MAX_REASON_DETAIL_LENGTH} characters` };
  }

  if (holdUntilDate !== null && holdUntilDate !== undefined && typeof holdUntilDate !== "string") {
    return { code: "invalid_hold_return_date", error: "Enter a valid return date" };
  }
  const returnDate = typeof holdUntilDate === "string" && holdUntilDate.trim() ? holdUntilDate.trim() : null;
  if (reason.requiresReturnDate && !returnDate) {
    return { code: "hold_return_date_required", error: "Choose a return date" };
  }
  if (!reason.requiresReturnDate && returnDate) {
    return { code: "hold_return_date_not_allowed", error: "A return date is only allowed for the customer-requested date reason" };
  }
  if (!returnDate) return null;
  if (!isValidDateKey(returnDate) || !isValidDateKey(currentDate)) {
    return { code: "invalid_hold_return_date", error: "Enter a valid return date" };
  }
  if (returnDate < currentDate) {
    return { code: "hold_return_date_in_past", error: "Return date cannot be in the past" };
  }
  return null;
}

export function isScheduledOrderHoldDue(holdUntilDate, todayInDhaka) {
  if (!isValidDateKey(holdUntilDate) || !isValidDateKey(todayInDhaka)) return false;
  return holdUntilDate < todayInDhaka;
}
