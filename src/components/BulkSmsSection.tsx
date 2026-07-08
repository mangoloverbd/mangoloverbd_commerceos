import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/ios-spinner";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RichButton } from "@/components/ui/rich-button";

const DEFAULT_CONFIRMATION_TEMPLATE =
  "Hello {customer_name}, your order {order_id} for ৳{price} has been confirmed. We will contact you before dispatch.";

const DEFAULT_DISPATCH_TEMPLATE =
  "Your order {order_id} has been dispatched via {courier_name}. Tracking code: {tracking_code}. Thank you for shopping with us.";

export function BulkSmsSection() {
  const [bulkSmsEnabled, setBulkSmsEnabled] = useState(false);
  const [bulkSmsApiKey, setBulkSmsApiKey] = useState("");
  const [bulkSmsSenderId, setBulkSmsSenderId] = useState("");
  const [bulkSmsConfirmationTemplate, setBulkSmsConfirmationTemplate] = useState(DEFAULT_CONFIRMATION_TEMPLATE);
  const [bulkSmsDispatchTemplate, setBulkSmsDispatchTemplate] = useState(DEFAULT_DISPATCH_TEMPLATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.settings) {
          setBulkSmsEnabled(data.settings["bulksms_enabled"] === "true");
          setBulkSmsApiKey(data.settings["bulksms_api_key"] || "");
          setBulkSmsSenderId(data.settings["bulksms_sender_id"] || "");
          setBulkSmsConfirmationTemplate(data.settings["bulksms_confirmation_template"] || DEFAULT_CONFIRMATION_TEMPLATE);
          setBulkSmsDispatchTemplate(data.settings["bulksms_dispatch_template"] || DEFAULT_DISPATCH_TEMPLATE);
        }
      })
      .catch(() => {
        toast.error("Failed to load Bulk SMS settings");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            bulksms_enabled: bulkSmsEnabled.toString(),
            bulksms_api_key: bulkSmsApiKey,
            bulksms_sender_id: bulkSmsSenderId,
            bulksms_confirmation_template: bulkSmsConfirmationTemplate,
            bulksms_dispatch_template: bulkSmsDispatchTemplate,
          },
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Bulk SMS settings updated.");
    } catch {
      toast.error("Could not save Bulk SMS settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Spinner className="h-4 w-4 text-black/30" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[17px] font-semibold text-black tracking-tight">Bulk SMS BD Integration</h2>
        <p className="mt-0.5 text-[13px] text-black/45">Configure automated SMS updates for confirmed and dispatched orders.</p>
      </div>

      <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-white divide-y divide-black/[0.06]">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <Label htmlFor="bulksms-enabled" className="text-[13px] font-medium text-black">Enable Bulk SMS BD</Label>
            <p className="mt-0.5 text-[11px] text-black/40">Send order confirmation and dispatch messages from your sender ID.</p>
          </div>
          <Switch
            id="bulksms-enabled"
            checked={bulkSmsEnabled}
            onCheckedChange={setBulkSmsEnabled}
            className="shrink-0 border border-black/[0.08] bg-black/[0.12] data-[state=checked]:bg-black data-[state=unchecked]:bg-black/[0.12]"
            thumbClassName="bg-white shadow-sm data-[state=unchecked]:translate-x-0 data-[state=checked]:translate-x-5"
          />
        </div>

        {bulkSmsEnabled && (
          <div className="space-y-4 px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="block text-[11px] font-medium text-black/50">API Key</Label>
                <Input
                  value={bulkSmsApiKey}
                  onChange={(e) => setBulkSmsApiKey(e.target.value)}
                  placeholder="SMS API Key"
                  type="password"
                  className="h-10 rounded-[10px] border border-black/[0.08] bg-black/[0.03] px-3 text-[13px] text-black outline-none transition-colors placeholder:text-black/25 focus-visible:ring-1 focus-visible:ring-black/10 focus-visible:ring-offset-0"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="block text-[11px] font-medium text-black/50">Sender ID</Label>
                <Input
                  value={bulkSmsSenderId}
                  onChange={(e) => setBulkSmsSenderId(e.target.value)}
                  placeholder="Sender ID"
                  className="h-10 rounded-[10px] border border-black/[0.08] bg-black/[0.03] px-3 text-[13px] text-black outline-none transition-colors placeholder:text-black/25 focus-visible:ring-1 focus-visible:ring-black/10 focus-visible:ring-offset-0"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="block text-[11px] font-medium text-black/50">Order Confirmation Template</Label>
              <Textarea
                value={bulkSmsConfirmationTemplate}
                onChange={(e) => setBulkSmsConfirmationTemplate(e.target.value)}
                placeholder="e.g. Hello {customer_name}, order {order_id} is confirmed."
                className="min-h-[88px] resize-none rounded-[10px] border border-black/[0.08] bg-black/[0.03] px-3 py-2 text-[13px] text-black outline-none transition-colors placeholder:text-black/25 focus-visible:ring-1 focus-visible:ring-black/10 focus-visible:ring-offset-0"
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="block text-[11px] font-medium text-black/50">Order Dispatch Template</Label>
              <Textarea
                value={bulkSmsDispatchTemplate}
                onChange={(e) => setBulkSmsDispatchTemplate(e.target.value)}
                placeholder="e.g. Order {order_id} dispatched via {courier_name}. Tracking: {tracking_code}"
                className="min-h-[88px] resize-none rounded-[10px] border border-black/[0.08] bg-black/[0.03] px-3 py-2 text-[13px] text-black outline-none transition-colors placeholder:text-black/25 focus-visible:ring-1 focus-visible:ring-black/10 focus-visible:ring-offset-0"
                rows={3}
              />
            </div>
            <p className="text-[11px] text-black/40">
              Placeholders: {"{customer_name}, {order_id}, {price}, {delivery_fee}, {courier_name}, {tracking_code}"}
            </p>

            <RichButton
              color="default"
              size="default"
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full mt-4"
            >
              {saving ? <Spinner size="sm" className="mr-2" /> : null}
              {saving ? "Saving..." : "Save Bulk SMS Settings"}
            </RichButton>
          </div>
        )}
      </div>
    </div>
  );
}
