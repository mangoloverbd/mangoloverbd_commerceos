/** Server cap per send; keep in sync with MAX_CUSTOMER_SMS_RECIPIENTS in server/customerSms.js. */
export const MAX_CUSTOMER_SMS_RECIPIENTS = 500;
export const MAX_CUSTOMER_SMS_LENGTH = 1000;

/**
 * Audience-level templates for the Customers page. Unlike the order editor's templates these
 * never mention a specific order. {{customer_name}} is filled per recipient on the server;
 * {{store_phone}} is filled in the composer before sending.
 */
export const CUSTOMER_SMS_TEMPLATES = [
  { id: "custom", label: "Custom", message: "" },
  {
    id: "thank-you",
    label: "Thank you",
    message: "প্রিয় {{customer_name}}, Mango Lover BD-এর সাথে থাকার জন্য আন্তরিক ধন্যবাদ। যেকোনো প্রয়োজনে কল করুন {{store_phone}}।",
  },
  {
    id: "new-season",
    label: "New season",
    message: "প্রিয় {{customer_name}}, এই মৌসুমের তাজা আম এখন অর্ডার করা যাচ্ছে। আগেভাগে অর্ডার করতে কল করুন {{store_phone}}।",
  },
  {
    id: "win-back",
    label: "We miss you",
    message: "প্রিয় {{customer_name}}, অনেক দিন আপনার অর্ডার পাইনি! আপনার পছন্দের পণ্যগুলো আবার প্রস্তুত আছে। অর্ডার করতে কল করুন {{store_phone}}।",
  },
  {
    id: "special-offer",
    label: "Special offer",
    message: "প্রিয় {{customer_name}}, নিয়মিত গ্রাহক হিসেবে আপনার জন্য Mango Lover BD-তে বিশেষ ছাড় চলছে। বিস্তারিত জানতে কল করুন {{store_phone}}।",
  },
  {
    id: "back-in-stock",
    label: "Back in stock",
    message: "সুখবর {{customer_name}}! আপনার আগে কেনা পণ্যটি আবার স্টকে এসেছে। স্টক শেষ হওয়ার আগে অর্ডার করুন: {{store_phone}}",
  },
  {
    id: "feedback",
    label: "Feedback",
    message: "প্রিয় {{customer_name}}, আমাদের পণ্য কেমন লেগেছে? আপনার মতামত জানাতে কল করুন {{store_phone}}। আপনার পরামর্শে আমরা আরও ভালো করব।",
  },
  {
    id: "eid",
    label: "Eid greeting",
    message: "প্রিয় {{customer_name}}, Mango Lover BD-এর পক্ষ থেকে আপনাকে ও আপনার পরিবারকে ঈদ মোবারক! ঈদের শুভেচ্ছা ও ভালোবাসা রইল।",
  },
] as const;

export type CustomerSmsTemplateId = (typeof CUSTOMER_SMS_TEMPLATES)[number]["id"];

// GSM-7 basic set plus the escape-table characters that fit in a plain-text SMS.
const GSM_CHARS = /^[A-Za-z0-9 @£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;

/** Number of SMS parts one message uses; Bangla and emoji switch the whole message to Unicode. */
export function smsSegments(message: string): number {
  const length = [...message].length;
  if (length === 0) return 0;
  const [single, multi] = GSM_CHARS.test(message) ? [160, 153] : [70, 67];
  return length <= single ? 1 : Math.ceil(length / multi);
}
