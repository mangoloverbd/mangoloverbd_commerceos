# Order Source on Create and Edit Order Pages

## Goal

Give staff a consistent Order Source field when creating and editing orders. New orders require a selected source, while existing orders show an automatically detected/normalized source that staff can correct at any time.

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

Automatic detection only supplies the initial/canonical source. Once staff manually edits the source, that stored value is authoritative. Courier webhooks, courier status updates, and other order sync paths must not overwrite it.

## Create Order behavior

Add an Order Source selector to the Customer and order section using the existing select styling. It will:

- default to Manual / Other;
- offer exactly Website, Facebook, Instagram, WhatsApp, Phone, and Manual / Other;
- submit the selected canonical value with the authenticated order-create request;
- remain unchanged when AI extraction fills customer or product details.

The server also applies the safe default for backward compatibility, so every newly created order has a valid source even if an older client omits it.

## Order Editor behavior

Add the same selector to the order metadata area. It will:

- initialize from the stored source after legacy normalization;
- always show a valid source label;
- remain editable even after courier dispatch locks cart editing;
- mark the page dirty when changed;
- support saving the source by itself without requiring unrelated order edits.

The source update is independent from status, courier, customer, cart, discount, delivery, and note updates.

## API and data flow

1. The Create Order page sends the selected source to `POST /api/orders`.
2. The authenticated server validates and stores the canonical source with the order.
3. Public storefront checkout stores `website` at its existing order insertion boundary.
4. The Order Editor reads the source returned by `GET /api/orders/:id`, normalizes legacy values, and sends changes through the authenticated `PATCH /api/orders/:id` route.
5. The patch route permits source edits with the existing workspace guard and does not couple source changes to courier or cart state.

All order reads and writes continue to use the resolved Mango Lover BD `org_id`. No public client receives direct database write access.

## Error handling

- Invalid source values return a clear `400` response.
- Missing source falls back to Manual / Other for compatibility.
- Failed source saves use the existing Order Editor error state and leave the draft available for retry.
- Courier and sync failures do not affect the saved source.

## Testing

Add regression coverage for:

- the six source options and default selection on Create Order;
- the selected source in the Create Order request;
- Website and social-channel detection/normalization;
- missing and legacy source fallback;
- editing a source on a dispatched order;
- source-only saves on Order Editor;
- API rejection of unsupported source values;
- public storefront orders storing Website;
- courier update paths leaving source unchanged.
