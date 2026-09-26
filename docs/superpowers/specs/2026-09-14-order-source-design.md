# Order Source on Create and Edit Order Pages

## Goal

Give staff a consistent Order Source field when creating orders. Staff can choose a source before saving; once an order exists, its source is read-only and cannot be changed.

## Scope

This change applies to the main Create Order page and Order Editor page. It does not add an Order Source column to dashboard tables or change the separate social inbox order editor.

## Source values

The existing nullable `orders.source` column will be reused. No duplicate `order_source` column is needed.

Canonical stored values and labels:

| Stored value | Display label |
|---|---|
| `website` | Website |
| `facebook` | Facebook |
| `instagram` | Instagram |
| `whatsapp` | WhatsApp |
| `phone` | Phone |
| `manual_other` | Manual / Other |

The API validates source values against this allowlist. Older clients that omit the field receive the safe `manual_other` fallback; unsupported values are rejected with a `400` response.

## Automatic detection and legacy normalization

- Public storefront checkout orders are stored as `website`.
- Facebook, Instagram, and WhatsApp inbox orders retain their platform source when converted into main orders.
- Merchant-created orders use the value selected in Create Order, defaulting to `manual_other`.
- Phone-created orders use `phone` when selected by staff.
- Existing legacy `custom_store`-style website values display as Website.
- Missing or unknown existing values display as Manual / Other.
- Shopify-specific behavior is out of scope because this merchant does not use Shopify.

Automatic detection supplies the initial/canonical source. Once an order is created, that stored value is authoritative. Courier webhooks, courier status updates, order edits, and other sync paths must not overwrite it.

## Create Order behavior

Add an Order Source selector to the Customer and order section using the existing select styling. It will:

- default to Manual / Other;
- offer exactly Website, Facebook, Instagram, WhatsApp, Phone, and Manual / Other;
- submit the selected canonical value with the authenticated order-create request;
- remain unchanged when AI extraction fills customer or product details.

The server also applies the safe default for backward compatibility, so every newly created order has a valid source even if an older client omits it.

## Order Editor behavior

Show the stored source in the order metadata area as a read-only value. It will:

- initialize from the stored source after legacy normalization;
- always show a valid source label;
- not be interactive, regardless of courier or cart state;
- not mark the page dirty or be included in order update requests.

Status, courier, customer, cart, discount, delivery, and note fields remain editable under their existing rules.

## API and data flow

1. The Create Order page sends the selected source to `POST /api/orders`.
2. The authenticated server validates and stores the canonical source with the order.
3. Public storefront checkout stores `website` at its existing order insertion boundary.
4. The Order Editor reads the source returned by `GET /api/orders/:id` and displays its normalized label without sending it in update requests.
5. The authenticated `PATCH /api/orders/:id` route rejects attempts to change a saved source with a `409` response and continues to allow unrelated order edits under the existing workspace guard.

All order reads and writes continue to use the resolved Mango Lover BD `org_id`. No public client receives direct database write access.

## Error handling

- Invalid source values return a clear `400` response.
- Attempts to change a saved source return `409` with code `order_source_locked`.
- Missing source falls back to Manual / Other for compatibility.
- Courier and sync failures do not affect the saved source.

## Testing

Add regression coverage for:

- the six source options and default selection on Create Order;
- the selected source in the Create Order request;
- Website and social-channel detection/normalization;
- missing and legacy source fallback;
- displaying the saved source as read-only on normal and dispatched orders;
- excluding the source from unrelated Order Editor saves;
- rejecting attempts to change a saved source through the API;
- API rejection of unsupported source values;
- public storefront orders storing Website;
- courier update paths leaving source unchanged.
