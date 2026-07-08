import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/ios-spinner";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Chat } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";

export function BulkSmsSection() {
  const [bulkSmsEnabled, setBulkSmsEnabled] = useState(false);
  const [bulkSmsApiKey, setBulkSmsApiKey] = useState("");
  const [bulkSmsSenderId, setBulkSmsSenderId] = useState("");
  const [bulkSmsConfirmationTemplate, setBulkSmsConfirmationTemplate] = useState("");
  const [bulkSmsDispatchTemplate, setBulkSmsDispatchTemplate] = useState("");
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
          setBulkSmsConfirmationTemplate(data.settings["bulksms_confirmation_template"] || "");
          setBulkSmsDispatchTemplate(data.settings["bulksms_dispatch_template"] || "");
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
    <Card className="p-6 bg-white border-0 shadow-none ring-1 ring-black/[0.08]">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Chat weight="light" size={24} />
          <h2 className="text-xl font-light">Bulk SMS BD Integration</h2>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-black px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-black/80 disabled:opacity-50"
        >
          {saving ? <Spinner size="sm" /> : "Save"}
        </button>
      </div>
      <div className="space-y-4 max-w-2xl">
        <div className="flex items-center justify-between">
          <Label htmlFor="bulksms-enabled">Enable Bulk SMS BD</Label>
          <Switch
            id="bulksms-enabled"
            checked={bulkSmsEnabled}
            onCheckedChange={setBulkSmsEnabled}
          />
        </div>
        {bulkSmsEnabled && (
          <div className="space-y-4 pt-4 border-t border-black/5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>API Key</Label>
                <Input
                  value={bulkSmsApiKey}
                  onChange={(e) => setBulkSmsApiKey(e.target.value)}
                  placeholder="SMS API Key"
                  type="password"
                />
              </div>
              <div className="space-y-2">
                <Label>Sender ID</Label>
                <Input
                  value={bulkSmsSenderId}
                  onChange={(e) => setBulkSmsSenderId(e.target.value)}
                  placeholder="Sender ID"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Order Confirmation Template</Label>
              <Textarea
                value={bulkSmsConfirmationTemplate}
                onChange={(e) => setBulkSmsConfirmationTemplate(e.target.value)}
                placeholder="e.g. Hello {customer_name}, order {order_id} is confirmed."
                className="resize-none"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Order Dispatch Template</Label>
              <Textarea
                value={bulkSmsDispatchTemplate}
                onChange={(e) => setBulkSmsDispatchTemplate(e.target.value)}
                placeholder="e.g. Order {order_id} dispatched via {courier_name}. Tracking: {tracking_code}"
                className="resize-none"
                rows={3}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Placeholders: {"{customer_name}, {order_id}, {price}, {delivery_fee}, {courier_name}, {tracking_code}"}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
