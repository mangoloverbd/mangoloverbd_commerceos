import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Buildings, X } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { RichButton } from "@/components/ui/rich-button";
import { Spinner } from "@/components/ui/ios-spinner";
import type { Warehouse } from "@/hooks/useWarehouses";

const fieldClass = "mt-1.5 h-10 rounded-[12px] border-black/10 bg-white px-3 text-[13px] shadow-none focus-visible:ring-1 focus-visible:ring-black/20";

export function WarehouseDialog({ open, warehouse, onClose, onSaved }: {
  open: boolean;
  warehouse: Warehouse | null;
  onClose: () => void;
  onSaved: () => Promise<unknown> | void;
}) {
  const reduce = useReducedMotion();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(warehouse?.name ?? "");
    setAddress(warehouse?.address ?? "");
    setContactPerson(warehouse?.contact_person ?? "");
    setPhone(warehouse?.phone ?? "");
    setIsDefault(Boolean(warehouse?.is_default));
    requestAnimationFrame(() => nameRef.current?.focus());
  }, [open, warehouse]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, saving]);

  async function submit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Warehouse name is required");
      nameRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      const response = await apiFetch(warehouse ? `/api/warehouses/${warehouse.id}` : "/api/warehouses", {
        method: warehouse ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          address: address.trim(),
          contact_person: contactPerson.trim(),
          phone: phone.trim(),
          is_default: isDefault,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Failed to save warehouse");
      await onSaved();
      toast.success(warehouse ? "Warehouse updated" : "Warehouse created");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save warehouse");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="warehouse-dialog-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
          className="fixed inset-0 z-40 grid place-items-center bg-black/12 px-4 backdrop-blur-[3px]"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget && !saving) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="warehouse-dialog-title"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97, filter: "blur(4px)" }}
            transition={{ duration: reduce ? 0.12 : 0.24, ease: "easeOut" }}
            className="max-h-[88vh] w-full max-w-lg overflow-hidden rounded-[24px] border border-black/10 bg-[#FAFAF8] shadow-2xl shadow-black/15"
          >
            <div className="flex items-center justify-between border-b border-black/[0.08] bg-white px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/[0.05] text-black/60">
                  <Buildings size={20} weight="light" />
                </span>
                <div>
                  <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/35">Inventory location</p>
                  <h2 id="warehouse-dialog-title" className="mt-0.5 text-[20px] font-bold tracking-tight text-black">
                    {warehouse ? "Edit warehouse" : "New warehouse"}
                  </h2>
                </div>
              </div>
              <button type="button" onClick={onClose} disabled={saving} aria-label="Close warehouse dialog" className="flex h-9 w-9 items-center justify-center rounded-xl text-black/35 transition-colors hover:bg-black/[0.04] hover:text-black disabled:opacity-40">
                <X size={18} weight="light" />
              </button>
            </div>

            <div className="max-h-[calc(88vh-82px)] overflow-y-auto p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-[11px] font-medium text-black/65 sm:col-span-2">
                  Warehouse name
                  <Input ref={nameRef} aria-label="Warehouse name" value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} placeholder="Main warehouse" />
                </label>
                <label className="text-[11px] font-medium text-black/65 sm:col-span-2">
                  Address
                  <Input aria-label="Address" value={address} onChange={(event) => setAddress(event.target.value)} className={fieldClass} placeholder="Street, area, city" />
                </label>
                <label className="text-[11px] font-medium text-black/65">
                  Contact person
                  <Input aria-label="Contact person" value={contactPerson} onChange={(event) => setContactPerson(event.target.value)} className={fieldClass} placeholder="Full name" />
                </label>
                <label className="text-[11px] font-medium text-black/65">
                  Phone
                  <Input aria-label="Phone" value={phone} onChange={(event) => setPhone(event.target.value)} className={fieldClass} placeholder="01XXXXXXXXX" inputMode="tel" />
                </label>
              </div>

              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-black/[0.06] bg-white p-3.5">
                <Checkbox checked={isDefault} onCheckedChange={(checked) => setIsDefault(checked === true)} aria-label="Default warehouse" className="mt-0.5" />
                <span>
                  <span className="block text-[12px] font-semibold text-black">Default warehouse</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-black/45">Products without an explicit location are routed here.</span>
                </span>
              </label>

              <div className="mt-6 flex items-center justify-end gap-2 border-t border-black/[0.06] pt-4">
                <Button type="button" variant="ghost" onClick={onClose} disabled={saving} className="h-10 rounded-xl px-4 text-[12px] font-medium">Cancel</Button>
                <RichButton type="button" onClick={() => void submit()} disabled={saving} aria-label={saving ? "Saving warehouse" : "Save warehouse"} className="h-10 min-w-[132px] justify-center rounded-xl bg-black px-4 text-[12px] text-white hover:bg-black">
                  {saving ? <><Spinner className="mr-2 text-white" />Saving…</> : "Save warehouse"}
                </RichButton>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
