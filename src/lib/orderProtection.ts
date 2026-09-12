import { apiFetch } from "@/lib/api";

export type ProtectionReview = {
  id: string;
  status: "on_hold" | "approved" | "rejected" | "expired";
  source_route: string;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  items: Array<Record<string, unknown>>;
  shipping_zone_id?: string | null;
  notes?: string | null;
  score: number;
  reason_codes: string[];
  created_at: string;
  updated_at?: string;
  expires_at: string;
};

export type ProtectionEvent = {
  id: string;
  review_id: string | null;
  order_id: string | null;
  route: string;
  decision: "ALLOW" | "REVIEW" | "BLOCK";
  score: number;
  reason_codes: string[];
  created_at: string;
  expires_at: string;
};

async function readApiResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Request failed");
  return payload as T;
}

export async function fetchProtectionReviews(status = "on_hold") {
  const response = await apiFetch(`/api/order-protection/reviews?status=${encodeURIComponent(status)}`);
  return readApiResponse<{ reviews: ProtectionReview[] }>(response);
}

export async function fetchProtectionEvents() {
  const response = await apiFetch("/api/order-protection/events");
  return readApiResponse<{ events: ProtectionEvent[] }>(response);
}

export async function updateProtectionReview(reviewId: string, action: "approve" | "reject") {
  const response = await apiFetch(`/api/order-protection/reviews/${encodeURIComponent(reviewId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  return readApiResponse<{ success: boolean; decision: string; orderRef?: string }>(response);
}

