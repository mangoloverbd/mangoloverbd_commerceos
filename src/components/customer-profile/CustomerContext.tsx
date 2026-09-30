import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/base/buttons/button";
import { DatePicker } from "@/components/base/date-picker/date-picker";
import type { CustomerContextData, CustomerNote, ProfilePage } from "@/lib/customerProfile";
import { customerDate } from "@/lib/customerProfile";

const EYEBROW = "text-[8px] font-medium uppercase tracking-[0.3em] text-black";
const CARD = "rounded-2xl bg-white p-5";
const labelClass = "block text-[12px] text-black/60";
const fieldClass = "mt-1.5 w-full rounded-[10px] bg-[#F7F7F5] px-3 py-2.5 text-base text-black placeholder:text-black/35 ring-1 ring-inset ring-transparent transition focus-visible:bg-white focus-visible:outline-none focus-visible:ring-black/25 disabled:opacity-60 sm:text-[13px]";
class ContextSaveError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function CustomerContext({ customerId, context, notes, onSaved, onNotesPage, onReload }: {
  customerId: string; context: CustomerContextData; notes: ProfilePage<CustomerNote>;
  onSaved: () => Promise<void>; onNotesPage: (page: number) => void; onReload: () => Promise<CustomerContextData>;
}) {
  // Keep drafts stable while other sections paginate or revalidate. Reloading
  // conflicting context is an explicit action rather than an effect that
  // silently overwrites what the operator typed.
  const [savedContext, setSavedContext] = useState(context);
  const [tags, setTags] = useState(context.tags.join(", "));
  const [followUpOn, setFollowUpOn] = useState(context.followUpOn || "");
  const [followUpReason, setFollowUpReason] = useState(context.followUpReason);
  const [note, setNote] = useState("");
  const [noteRequest, setNoteRequest] = useState<{ id: string; body: string } | null>(null);
  const [message, setMessage] = useState("");
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState("");
  const base = `/api/customers/${encodeURIComponent(customerId)}`;

  const saveContext = useMutation({
    mutationFn: async () => {
      const response = await apiFetch(`${base}/context`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), followUpOn: followUpOn || null, followUpReason: followUpReason.trim(), expectedVersion: savedContext.version }) });
      const data = await response.json();
      if (!response.ok) throw new ContextSaveError(data.error || "Could not save customer context", response.status);
      return data.context as CustomerContextData;
    },
    onSuccess: async (next) => {
      setSavedContext(next); setTags(next.tags.join(", ")); setMessage("Customer context saved");
      await onSaved();
    },
  });
  const saveNote = useMutation({
    mutationFn: async (input: { id: string; body: string }) => {
      const response = await apiFetch(`${base}/notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save note");
      return data.note as CustomerNote;
    },
    onSuccess: async () => { setNote(""); setNoteRequest(null); setMessage("Note added"); onNotesPage(1); await onSaved(); },
  });

  async function reloadContext() {
    setReloading(true); setReloadError("");
    try {
      const next = await onReload();
      setSavedContext(next); setTags(next.tags.join(", ")); setFollowUpOn(next.followUpOn || ""); setFollowUpReason(next.followUpReason); saveContext.reset();
      setMessage("Saved context reloaded");
    } catch (error) { setReloadError(error instanceof Error ? error.message : "Could not reload context"); }
    finally { setReloading(false); }
  }

  return <>
    <section aria-labelledby="notes-heading" className={`${CARD} flex flex-col`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="notes-heading" className={EYEBROW}>Internal notes</h2>
        {notes.total > 0 && <p className="text-[12px] text-black/55 tabular-nums">{notes.total}</p>}
      </div>
      <form className="mt-4 space-y-2.5" onSubmit={(event) => {
        event.preventDefault(); setMessage("");
        const input = noteRequest?.body === note.trim() ? noteRequest : { id: crypto.randomUUID(), body: note.trim() };
        setNoteRequest(input); saveNote.mutate(input);
      }}>
        <label className="block"><span className="sr-only">Internal note</span><textarea aria-label="Internal note" className={fieldClass} rows={3} maxLength={4000} required placeholder="Add a note for the team" value={note} onChange={(event) => setNote(event.target.value)} disabled={saveNote.isPending} aria-describedby="note-error" /></label>
        <p id="note-error" role={saveNote.error ? "alert" : undefined} className="text-[12px] text-[#B4473A] empty:hidden">{saveNote.error?.message}</p>
        <div className="flex items-center justify-between gap-2">
          <p role="status" className="text-[11px] text-black/55">{message}</p>
          <Button type="submit" variant="primary" size="small" disabled={saveNote.isPending}>{saveNote.isPending ? "Adding note…" : "Add note"}</Button>
        </div>
      </form>
      {notes.total ? <ul className="mt-4 divide-y divide-black/[0.08] border-t border-black/[0.08]">
        {notes.items.map((entry) => <li key={entry.id} className="py-3 last:pb-0"><p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-black">{entry.body}</p><p className="mt-1 text-[11px] text-black/50">{entry.authorName} · {customerDate(entry.createdAt)}</p></li>)}
      </ul> : <p className="mt-4 text-[13px] text-black/55">No internal notes yet.</p>}
      {notes.totalPages > 1 && <div className="mt-3 flex items-center justify-between gap-2 text-[12px] text-black/55 tabular-nums"><Button variant="ghost" size="small" disabled={notes.page <= 1} onClick={() => onNotesPage(notes.page - 1)}>Previous notes</Button><span>{notes.page}/{notes.totalPages}</span><Button variant="ghost" size="small" disabled={notes.page >= notes.totalPages} onClick={() => onNotesPage(notes.page + 1)}>Next notes</Button></div>}
    </section>
    <section aria-labelledby="staff-context-heading" className={`${CARD} flex flex-col`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="staff-context-heading" className={EYEBROW}>Staff context</h2>
        <p className="text-[12px] text-black/55">Private to your team</p>
      </div>
      <form className="mt-4 space-y-3.5" onSubmit={(event) => { event.preventDefault(); setMessage(""); saveContext.mutate(); }}>
        <div>
          <label className={labelClass}>Manual tags<input className={fieldClass} value={tags} maxLength={820} placeholder="Honey buyer, Call first" onChange={(event) => setTags(event.target.value)} disabled={saveContext.isPending} aria-describedby="manual-tag-help context-error" /></label>
          <p id="manual-tag-help" className="mt-1 text-[11px] text-black/50">Comma-separated, up to 20. Separate from calculated segments.</p>
        </div>
        <div><p className={labelClass}>Follow-up date</p><DatePicker className="mt-1.5" aria-label="Follow-up date" value={followUpOn || null} onChange={(next) => setFollowUpOn(next || "")} isDisabled={saveContext.isPending} /></div>
        <label className={labelClass}>Follow-up reason<textarea className={fieldClass} rows={2} maxLength={500} value={followUpReason} onChange={(event) => setFollowUpReason(event.target.value)} disabled={saveContext.isPending} aria-describedby="context-error" /></label>
        <p id="context-error" role={saveContext.error ? "alert" : undefined} className="text-[12px] text-[#B4473A] empty:hidden">{saveContext.error?.message}</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {savedContext.updatedAt ? <p className="text-[11px] text-black/50">Saved by {savedContext.updatedByName || "Unknown"} · {customerDate(savedContext.updatedAt)}</p> : <span />}
          <Button type="submit" variant="secondary" size="small" disabled={saveContext.isPending || reloading}>{saveContext.isPending ? "Saving customer context…" : "Save customer context"}</Button>
        </div>
        {saveContext.error instanceof ContextSaveError && saveContext.error.status === 409 && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F7F7F5] px-3.5 py-3"><p className="text-[11px] text-black/60">Reload replaces your draft with the latest saved values.</p><Button type="button" variant="secondary" size="small" disabled={reloading} onClick={reloadContext}>{reloading ? "Reloading…" : "Reload saved context"}</Button></div>}
        {reloadError && <p role="alert" className="text-[12px] text-[#B4473A]">{reloadError}</p>}
      </form>
    </section>
  </>;
}
