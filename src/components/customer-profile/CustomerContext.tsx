import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import type { CustomerContextData, CustomerNote, ProfilePage } from "@/lib/customerProfile";
import { customerDate } from "@/lib/customerProfile";

const fieldClass = "mt-1.5 w-full rounded-lg border border-black/15 bg-transparent p-2.5 text-base sm:text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black";
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

  return <div className="space-y-8">
    <section aria-labelledby="staff-context-heading">
      <h2 id="staff-context-heading" className="text-base font-medium">Staff context</h2>
      <p className="mt-1 text-xs leading-relaxed text-black/60">Private to your team. These fields never change historical orders.</p>
      <form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); setMessage(""); saveContext.mutate(); }}>
        <label className="block text-sm">Manual tags<input className={fieldClass} value={tags} maxLength={820} placeholder="Honey buyer, Call first" onChange={(event) => setTags(event.target.value)} disabled={saveContext.isPending} aria-describedby="manual-tag-help context-error" /></label>
        <p id="manual-tag-help" className="text-xs text-black/60">Comma-separated. Up to 20 tags; separate from calculated segments.</p>
        <label className="block text-sm">Follow-up date<input type="date" className={fieldClass} value={followUpOn} onChange={(event) => setFollowUpOn(event.target.value)} disabled={saveContext.isPending} /></label>
        <label className="block text-sm">Follow-up reason<textarea className={fieldClass} rows={2} maxLength={500} value={followUpReason} onChange={(event) => setFollowUpReason(event.target.value)} disabled={saveContext.isPending} aria-describedby="context-error" /></label>
        <p id="context-error" role={saveContext.error ? "alert" : undefined} className="text-sm text-red-700">{saveContext.error?.message}</p>
        <Button type="submit" variant="outline" disabled={saveContext.isPending || reloading}>{saveContext.isPending ? "Saving customer context…" : "Save customer context"}</Button>
        {saveContext.error instanceof ContextSaveError && saveContext.error.status === 409 && <div className="space-y-2"><p className="text-xs text-black/65">Reload replaces your draft with the latest saved tags and follow-up.</p><Button type="button" variant="outline" disabled={reloading} onClick={reloadContext}>{reloading ? "Reloading…" : "Reload saved context"}</Button></div>}
        {reloadError && <p role="alert" className="text-sm text-red-700">{reloadError}</p>}
      </form>
      {savedContext.updatedAt && <p className="mt-3 text-xs text-black/60">Last saved by {savedContext.updatedByName || "Unknown"} · {customerDate(savedContext.updatedAt)}</p>}
    </section>
    <section aria-labelledby="notes-heading">
      <h2 id="notes-heading" className="text-base font-medium">Internal notes</h2>
      <form className="mt-4 space-y-3" onSubmit={(event) => {
        event.preventDefault(); setMessage("");
        const input = noteRequest?.body === note.trim() ? noteRequest : { id: crypto.randomUUID(), body: note.trim() };
        setNoteRequest(input); saveNote.mutate(input);
      }}>
        <label className="block text-sm">Internal note<textarea className={fieldClass} rows={3} maxLength={4000} required value={note} onChange={(event) => setNote(event.target.value)} disabled={saveNote.isPending} aria-describedby="note-error" /></label>
        <p id="note-error" role={saveNote.error ? "alert" : undefined} className="text-sm text-red-700">{saveNote.error?.message}</p>
        <Button type="submit" variant="outline" disabled={saveNote.isPending}>{saveNote.isPending ? "Adding note…" : "Add note"}</Button>
      </form>
      <p role="status" className="mt-2 text-xs text-black/65">{message}</p>
      <ul className="mt-4 divide-y divide-black/10">
        {notes.items.map((entry) => <li key={entry.id} className="py-4"><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{entry.body}</p><p className="mt-2 text-xs text-black/60">{entry.authorName} · {customerDate(entry.createdAt)}</p></li>)}
      </ul>
      {!notes.total && <p className="mt-4 text-sm text-black/60">No internal notes yet.</p>}
      {notes.totalPages > 1 && <div className="mt-3 flex items-center justify-between gap-2"><Button variant="ghost" disabled={notes.page <= 1} onClick={() => onNotesPage(notes.page - 1)}>Previous notes</Button><span className="text-xs">{notes.page}/{notes.totalPages}</span><Button variant="ghost" disabled={notes.page >= notes.totalPages} onClick={() => onNotesPage(notes.page + 1)}>Next notes</Button></div>}
    </section>
  </div>;
}
