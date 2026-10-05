import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "@/components/ui/sonner";
import {
  Trash, Users, Copy, Check, Crown, Eye, EyeSlash,
  Lock, WarningCircle, Briefcase, CaretDown, Plus, Key,
} from "@phosphor-icons/react";
import {
  AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent,
  useReducedMotion, type AnimationPlaybackControls,
} from "framer-motion";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/ios-spinner";
import { RichButton } from "@/components/ui/rich-button";
import { Button } from "@/components/base/buttons/button";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface TeamMember {
  id: string;
  user_id: string;
  role: "admin" | "team_member";
  email?: string;
  org_id?: string;
  display_name?: string | null;
  post?: string | null;
  suspended_at?: string | null;
  created_at?: string;
}

interface GeneratedCredentials {
  email: string;
  password: string;
}

const POST_PRESETS = ["Moderator", "Order Manager", "Customer Support", "Packer", "Delivery Coordinator"];
const AUTO_CLOSE_SECONDS = 12;
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const labelClass = "block text-[8px] font-medium uppercase tracking-[0.3em] text-black";

function memberLabel(member: TeamMember) {
  return member.display_name || member.email || `${member.user_id.slice(0, 16)}…`;
}

function initials(member: TeamMember) {
  const source = member.display_name || member.email || "?";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (member.display_name ? parts[1]?.[0] || "" : "")).toUpperCase();
}

export function TeamManagement() {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => { fetchMembers(); }, []);

  const fetchMembers = async () => {
    try {
      const res = await apiFetch("/api/team-members");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch team members");
      setMembers(data.members || []);
    } catch (error) {
      console.error("Error fetching team data:", error);
    } finally {
      setLoading(false);
    }
  };

  const patchMember = async (member: TeamMember, body: Record<string, unknown>) => {
    const res = await apiFetch(`/api/team-members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to save");
    return data.member as Partial<TeamMember> | undefined;
  };

  const updateLocal = (id: string, patch: Partial<TeamMember>) =>
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const handleRename = async (member: TeamMember, value: string) => {
    const next = value.trim();
    if (next === (member.display_name || "")) return;
    try {
      await patchMember(member, { display_name: next || null });
      updateLocal(member.id, { display_name: next || null });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save name");
    }
  };

  const handlePostChange = async (member: TeamMember, value: string) => {
    const next = value.trim();
    if (next === (member.post || "")) return;
    const previous = member.post ?? null;
    updateLocal(member.id, { post: next || null });
    try {
      await patchMember(member, { post: next || null });
    } catch (error) {
      updateLocal(member.id, { post: previous });
      toast.error(error instanceof Error ? error.message : "Failed to save post");
    }
  };

  const handleToggleActive = async (member: TeamMember, active: boolean) => {
    const previous = member.suspended_at ?? null;
    setToggling(member.id);
    updateLocal(member.id, { suspended_at: active ? null : new Date().toISOString() });
    try {
      const saved = await patchMember(member, { active });
      if (saved && "suspended_at" in saved) updateLocal(member.id, { suspended_at: saved.suspended_at ?? null });
      toast.success(active ? `${memberLabel(member)} can sign in again` : `${memberLabel(member)} is switched off`);
    } catch (error) {
      updateLocal(member.id, { suspended_at: previous });
      toast.error(error instanceof Error ? error.message : "Failed to update access");
    } finally {
      setToggling(null);
    }
  };

  const handleRemoveMember = async () => {
    const member = pendingRemoval;
    if (!member) return;
    setRemoving(true);
    try {
      const res = await apiFetch(`/api/team-members/${member.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove member");
      toast.success("Member removed");
      setPendingRemoval(null);
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove member");
    } finally {
      setRemoving(false);
    }
  };

  const activeCount = members.filter((m) => !m.suspended_at).length;
  const stats = [
    { label: "Members", value: members.length },
    { label: "Active", value: activeCount },
    { label: "Switched off", value: members.length - activeCount },
  ];

  return (
    <div className="space-y-8">
      {/* Overview */}
      <div className="grid grid-cols-3 divide-x divide-black/[0.06] overflow-hidden rounded-[18px] border border-black/[0.06] bg-white">
        {stats.map((stat) => (
          <div key={stat.label} className="px-4 py-4 sm:px-5">
            <p className={labelClass}>{stat.label}</p>
            <motion.p
              key={stat.value}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
              className="mt-2 text-2xl font-light tabular-nums text-black"
            >
              {loading ? "–" : stat.value}
            </motion.p>
          </div>
        ))}
      </div>

      {/* Member list */}
      <div>
        <div className="mb-2.5 flex items-center justify-between gap-3 px-1">
          <div className="min-w-0">
            <p className={labelClass}>Members</p>
            {isAdmin && (
              <p className="mt-1 text-[11px] text-black/50">Switch someone off to pause their access without removing them.</p>
            )}
          </div>
          {isAdmin && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => setAddOpen(true)}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-black pl-3 pr-3.5 text-[12px] font-medium text-white transition-colors hover:bg-black/85"
              data-testid="button-open-add-member"
            >
              <Plus weight="light" size={14} />
              Add member
            </motion.button>
          )}
        </div>

        <div className="overflow-hidden rounded-[18px] border border-black/[0.06] bg-white">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-center justify-center py-12"
              >
                <Spinner className="h-4 w-4 text-black" />
              </motion.div>
            ) : members.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.22 }}
                className="flex flex-col items-center justify-center gap-2 py-12"
              >
                <Users weight="light" size={22} className="text-black/30" />
                <p className="text-[13px] text-black">No members yet</p>
              </motion.div>
            ) : (
              <motion.ul
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="divide-y divide-black/[0.06]"
              >
                <AnimatePresence initial={false}>
                  {members.map((member, i) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      index={i}
                      isSelf={member.user_id === user?.id}
                      canManage={isAdmin}
                      toggling={toggling === member.id}
                      onRename={handleRename}
                      onPostChange={handlePostChange}
                      onToggleActive={handleToggleActive}
                      onRequestRemove={setPendingRemoval}
                    />
                  ))}
                </AnimatePresence>
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      </div>

      {!isAdmin && (
        <div className="flex items-center gap-3 overflow-hidden rounded-[18px] border border-black/[0.06] bg-white px-5 py-4 text-black">
          <Lock weight="light" size={16} className="shrink-0" />
          <p className="text-[13px]">Only admins can add or remove team members.</p>
        </div>
      )}

      <AddMemberDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={fetchMembers}
      />

      <RemoveMemberDialog
        member={pendingRemoval}
        removing={removing}
        onCancel={() => { if (!removing) setPendingRemoval(null); }}
        onConfirm={handleRemoveMember}
        onSwitchOff={(member) => {
          setPendingRemoval(null);
          void handleToggleActive(member, false);
        }}
      />
    </div>
  );
}

interface MemberRowProps {
  member: TeamMember;
  index: number;
  isSelf: boolean;
  canManage: boolean;
  toggling: boolean;
  onRename: (member: TeamMember, value: string) => void;
  onPostChange: (member: TeamMember, value: string) => void;
  onToggleActive: (member: TeamMember, active: boolean) => void;
  onRequestRemove: (member: TeamMember) => void;
}

function MemberRow({
  member, index, isSelf, canManage, toggling,
  onRename, onPostChange, onToggleActive, onRequestRemove,
}: MemberRowProps) {
  const isAdminRow = member.role === "admin";
  const active = !member.suspended_at;
  const manageable = canManage && !isSelf && !isAdminRow;
  const [name, setName] = useState(member.display_name || "");

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.22, ease: EASE_OUT } }}
      transition={{ duration: 0.22, delay: index * 0.035, ease: EASE_OUT }}
      className="group flex flex-col gap-3 overflow-hidden px-4 py-3.5 transition-colors hover:bg-black/[0.02] sm:flex-row sm:items-center sm:gap-4"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="relative shrink-0">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-semibold transition-colors duration-300",
              isAdminRow ? "bg-black text-white" : active ? "bg-black/80 text-white" : "bg-black/10 text-black/40",
            )}
          >
            {initials(member)}
          </div>
          <span
            aria-hidden
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white transition-colors duration-300",
              active ? "bg-emerald-500" : "bg-black/20",
            )}
          />
        </div>

        <div className={cn("min-w-0 flex-1 transition-opacity duration-300", !active && "opacity-60")}>
          <div className="flex min-w-0 items-center gap-1.5">
            {canManage ? (
              <input
                aria-label={`Name for ${member.email || member.user_id}`}
                value={name}
                size={Math.max((name || "Add name").length, 4)}
                placeholder="Add name"
                onChange={(event) => setName(event.target.value)}
                onBlur={(event) => void onRename(member, event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                className="min-w-0 max-w-full truncate rounded bg-transparent text-[13px] font-medium text-black outline-none [field-sizing:content] placeholder:text-black/30 focus:bg-white focus:px-1.5"
              />
            ) : (
              <p className="truncate text-[13px] font-medium text-black">{memberLabel(member)}</p>
            )}
            {isAdminRow && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                <Crown weight="light" size={10} />
                Admin
              </span>
            )}
            {isSelf && (
              <span className="shrink-0 rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[10px] text-black/60">You</span>
            )}
          </div>
          <p className="truncate text-[11px] text-black/50">
            {member.email || `${member.user_id.slice(0, 16)}…`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 pl-12 sm:pl-0">
        <div className="flex sm:w-[180px] sm:justify-end">
          <PostPicker member={member} editable={canManage} onChange={onPostChange} />
        </div>

        <div className="ml-auto flex w-[76px] items-center justify-end gap-1.5 sm:ml-0">
          {manageable ? (
            <>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={active ? "on" : "off"}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3 }}
                  transition={{ duration: 0.15 }}
                  className={cn("w-7 text-right text-[11px]", active ? "text-emerald-600" : "text-black/40")}
                >
                  {active ? "On" : "Off"}
                </motion.span>
              </AnimatePresence>
              <Switch
                checked={active}
                disabled={toggling}
                onCheckedChange={(checked) => onToggleActive(member, checked)}
                aria-label={`${active ? "Switch off" : "Switch on"} ${memberLabel(member)}`}
                data-testid={`switch-member-active-${member.id}`}
              />
            </>
          ) : (
            <span className="text-[11px] text-black/35" title="Admins and your own account always have access">
              Always on
            </span>
          )}
        </div>

        <div className="flex w-8 justify-end">
          {manageable && (
            <button
              onClick={() => onRequestRemove(member)}
              className="shrink-0 rounded-lg p-1.5 text-black/30 transition-colors hover:bg-red-50 hover:text-red-500 focus-visible:text-red-500"
              aria-label={`Remove ${memberLabel(member)}`}
              title="Remove"
              data-testid={`button-remove-member-${member.id}`}
            >
              <Trash weight="light" size={15} />
            </button>
          )}
        </div>
      </div>
    </motion.li>
  );
}

function PostPicker({
  member, editable, onChange,
}: {
  member: TeamMember;
  editable: boolean;
  onChange: (member: TeamMember, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const current = member.post || "";

  const pill = (
    <span
      className={cn(
        "inline-flex h-7 max-w-[180px] items-center gap-1.5 rounded-full px-2.5 text-[11px] transition-colors",
        current ? "bg-white text-black border border-black/[0.08]" : "border border-dashed border-black/15 text-black/40",
        editable && "hover:border-black/25 hover:text-black",
      )}
    >
      <Briefcase weight="light" size={12} className="shrink-0" />
      <span className="truncate">{current || "Set post"}</span>
      {editable && <CaretDown weight="light" size={10} className="shrink-0" />}
    </span>
  );

  if (!editable) return current ? pill : null;

  const choose = (value: string) => {
    onChange(member, value);
    setCustom("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Post for ${memberLabel(member)}`}>{pill}</button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 rounded-xl border-black/[0.08] bg-white p-1.5 shadow-lg">
        <p className="px-2 pb-1 pt-1.5 text-[8px] font-medium uppercase tracking-[0.3em] text-black">Post</p>
        {POST_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => choose(preset)}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[12px] text-black hover:bg-black/[0.04]"
          >
            {preset}
            {current === preset && <Check weight="light" size={12} />}
          </button>
        ))}
        <form
          onSubmit={(e) => { e.preventDefault(); if (custom.trim()) choose(custom); }}
          className="mt-1 flex items-center gap-1 border-t border-black/[0.06] px-1 pt-1.5"
        >
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Custom post"
            aria-label="Custom post name"
            className="h-8 min-w-0 flex-1 rounded-md bg-black/[0.03] px-2 text-[12px] text-black outline-none placeholder:text-black/30"
          />
          <button
            type="submit"
            disabled={!custom.trim()}
            aria-label="Save custom post"
            className="flex h-8 w-8 items-center justify-center rounded-md text-black hover:bg-black/[0.05] disabled:opacity-30"
          >
            <Plus weight="light" size={14} />
          </button>
        </form>
        {current && (
          <button
            type="button"
            onClick={() => choose("")}
            className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-[12px] text-black/50 hover:bg-black/[0.04] hover:text-black"
          >
            Clear post
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function RemoveMemberDialog({
  member, removing, onCancel, onConfirm, onSwitchOff,
}: {
  member: TeamMember | null;
  removing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onSwitchOff: (member: TeamMember) => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {member && (
        <motion.div
          key="remove-member-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2, delay: 0.05 } }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-[2px]"
          onClick={(e) => e.target === e.currentTarget && onCancel()}
        >
          <RemoveMemberPanel
            member={member}
            removing={removing}
            reduceMotion={!!reduceMotion}
            onCancel={onCancel}
            onConfirm={onConfirm}
            onSwitchOff={onSwitchOff}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RemoveMemberPanel({
  member, removing, reduceMotion, onCancel, onConfirm, onSwitchOff,
}: {
  member: TeamMember;
  removing: boolean;
  reduceMotion: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onSwitchOff: (member: TeamMember) => void;
}) {
  // The warning closes itself if left untouched; hovering or removing pauses it.
  const progress = useMotionValue(1);
  const [secondsLeft, setSecondsLeft] = useState(AUTO_CLOSE_SECONDS);
  const controls = useRef<AnimationPlaybackControls | null>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useMotionValueEvent(progress, "change", (value) => {
    setSecondsLeft(Math.max(1, Math.ceil(value * AUTO_CLOSE_SECONDS)));
  });

  useEffect(() => {
    controls.current = animate(progress, 0, {
      duration: AUTO_CLOSE_SECONDS,
      ease: "linear",
      onComplete: () => onCancelRef.current(),
    });
    return () => controls.current?.stop();
  }, [progress]);

  useEffect(() => {
    if (removing) controls.current?.pause();
  }, [removing]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onCancelRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pause = () => controls.current?.pause();
  const resume = () => { if (!removing) controls.current?.play(); };
  const active = !member.suspended_at;

  return (
    <motion.div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="remove-member-title"
      aria-describedby="remove-member-description"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 12 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
      transition={reduceMotion ? { duration: 0.15 } : { type: "spring", stiffness: 420, damping: 32, mass: 0.8 }}
      onMouseEnter={pause}
      onMouseLeave={resume}
      className="relative w-full max-w-[400px] overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]"
    >
      <div className="p-6">
        <motion.div
          initial={reduceMotion ? false : { scale: 0.6, rotate: -12, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.06 }}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-500"
        >
          <WarningCircle weight="light" size={24} />
        </motion.div>

        <h2 id="remove-member-title" className="mt-4 text-[17px] font-semibold tracking-[-0.01em] text-black">
          Remove {memberLabel(member)}?
        </h2>
        <div id="remove-member-description" className="mt-2 space-y-2 text-[13px] leading-relaxed text-black/60">
          <p>They will be signed out and lose access to Merchant-Suite immediately. This cannot be undone.</p>
          <p>Orders and activity they handled keep their name.</p>
        </div>

        {active && (
          <button
            type="button"
            onClick={() => onSwitchOff(member)}
            disabled={removing}
            className="mt-4 w-full rounded-xl bg-black/[0.04] px-3.5 py-2.5 text-left text-[12px] text-black/70 transition-colors hover:bg-black/[0.07] hover:text-black disabled:opacity-50"
          >
            Only need a break? <span className="font-medium text-black underline underline-offset-2">Switch them off instead</span> — you can turn access back on any time.
          </button>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <span className="text-[11px] tabular-nums text-black/35" aria-live="off">
            Closes in {secondsLeft}s
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={removing}
              autoFocus
              className="h-10 rounded-lg px-4 text-[13px] font-medium text-black/60 transition-colors hover:text-black disabled:opacity-50"
            >
              Cancel
            </button>
            <RichButton
              color="red"
              size="default"
              onClick={onConfirm}
              disabled={removing}
              className="h-10 rounded-lg px-4"
              data-testid="button-confirm-remove-member"
            >
              {removing ? <Spinner size="sm" className="mr-2" /> : null}
              {removing ? "Removing…" : "Remove member"}
            </RichButton>
          </div>
        </div>
      </div>

      <motion.div
        aria-hidden
        style={{ scaleX: progress, originX: 0 }}
        className="absolute bottom-0 left-0 h-[3px] w-full bg-red-400/70"
      />
    </motion.div>
  );
}

const POST_DESCRIPTIONS: Record<string, string> = {
  Moderator: "Replies to social inbox chats",
  "Order Manager": "Confirms and edits orders",
  "Customer Support": "Calls customers, handles returns",
  Packer: "Packs parcels for dispatch",
  "Delivery Coordinator": "Books couriers, tracks parcels",
};

const stepFieldClass =
  "h-12 w-full rounded-[14px] border border-black/[0.09] bg-white px-4 text-[15px] text-black outline-none transition-colors placeholder:text-black/30 focus:border-black/30";

function AddMemberDialog({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const reduceMotion = !!useReducedMotion();
  const [busy, setBusy] = useState(false);
  const close = () => { if (!busy) onClose(); };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="add-member-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2, delay: 0.05 } }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-[2px]"
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <AddMemberPanel reduceMotion={reduceMotion} onClose={close} onBusyChange={setBusy} onCreated={onCreated} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AddMemberPanel({
  reduceMotion, onClose, onBusyChange, onCreated,
}: {
  reduceMotion: boolean;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [direction, setDirection] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [post, setPost] = useState("");
  const [customPost, setCustomPost] = useState(false);
  const [manualPassword, setManualPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<GeneratedCredentials | null>(null);
  const [copied, setCopied] = useState<"email" | "password" | "both" | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const firstName = name.trim().split(/\s+/)[0] || "";
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordValid = !manualPassword || password.length >= 6;
  const canContinue = emailValid && passwordValid;

  const go = (next: 1 | 2 | 3) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  const reset = () => {
    setName(""); setEmail(""); setPost(""); setCustomPost(false);
    setManualPassword(false); setPassword(""); setCreated(null); setShowPassword(false);
    go(1);
  };

  const submit = async () => {
    if (!canContinue || creating) return;
    setCreating(true);
    onBusyChange(true);
    try {
      const res = await apiFetch("/api/team-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password: (manualPassword && password) || undefined,
          display_name: name.trim() || undefined,
          post: post.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create member");
      setCreated({ email: data.email, password: data.password });
      onCreated();
      go(3);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create member");
    } finally {
      setCreating(false);
      onBusyChange(false);
    }
  };

  const copy = async (text: string, type: "email" | "password" | "both") => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const slide = {
    initial: reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24 * direction },
    animate: { opacity: 1, x: 0 },
    exit: reduceMotion ? { opacity: 0 } : { opacity: 0, x: -24 * direction },
    transition: { duration: 0.22, ease: EASE_OUT },
  };

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-member-title"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 12 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
      transition={reduceMotion ? { duration: 0.15 } : { type: "spring", stiffness: 420, damping: 32, mass: 0.8 }}
      className="w-full max-w-[480px] overflow-hidden rounded-3xl bg-white p-7 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.45)]"
    >
      {/* Progress */}
      <div className="flex items-center gap-2" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span key={n} className="relative h-1 flex-1 overflow-hidden rounded-full bg-black/[0.08]">
            <motion.span
              className="absolute inset-0 origin-left rounded-full bg-black"
              initial={false}
              animate={{ scaleX: n <= step ? 1 : 0 }}
              transition={{ duration: 0.35, ease: EASE_OUT }}
            />
          </span>
        ))}
      </div>
      <p className="mt-4 text-[12px] text-black/50">Step {step} of 3</p>

      <AnimatePresence mode="wait" initial={false} custom={direction}>
        {step === 1 && (
          <motion.form
            key="step-1"
            {...slide}
            onSubmit={(e) => { e.preventDefault(); if (canContinue) go(2); }}
          >
            <h2 id="add-member-title" className="mt-1 text-[22px] font-semibold tracking-[-0.02em] text-black">
              Who are you adding?
            </h2>
            <div className="mt-5 space-y-3">
              <label className="block space-y-1.5">
                <span className="text-[12px] font-medium text-black">Full name</span>
                <input autoFocus placeholder="e.g. Rakib Hasan" value={name} onChange={(e) => setName(e.target.value)} className={stepFieldClass} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[12px] font-medium text-black">Email</span>
                <input type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className={stepFieldClass} />
              </label>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => setManualPassword(!manualPassword)}
                className="inline-flex items-center gap-1.5 text-[12px] text-black/50 transition-colors hover:text-black"
              >
                <Key weight="light" size={14} />
                {manualPassword ? "Generate a password for me instead" : "Set a password myself"}
              </button>
              <AnimatePresence initial={false}>
                {manualPassword && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: EASE_OUT }}
                    className="overflow-hidden"
                  >
                    <label className="mt-2.5 block">
                      <span className="sr-only">Password</span>
                      <input
                        type="text"
                        placeholder="At least 6 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={stepFieldClass}
                      />
                    </label>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="mt-7 flex items-center justify-between">
              <Button variant="danger" onClick={onClose}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={!canContinue} data-testid="button-add-member-continue">
                Continue
              </Button>
            </div>
          </motion.form>
        )}

        {step === 2 && (
          <motion.div key="step-2" {...slide}>
            <h2 id="add-member-title" className="mt-1 text-[22px] font-semibold tracking-[-0.02em] text-black">
              What will {firstName || "they"} do?
            </h2>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              {POST_PRESETS.map((preset) => {
                const selected = !customPost && post === preset;
                return (
                  <motion.button
                    key={preset}
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    aria-pressed={selected}
                    onClick={() => { setCustomPost(false); setPost(selected ? "" : preset); }}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-[14px] border p-3.5 text-left transition-colors",
                      selected ? "border-black bg-[#F6F6F4]" : "border-black/[0.08] bg-white hover:border-black/20",
                    )}
                  >
                    <span className="text-[13.5px] font-medium text-black">{preset}</span>
                    <span className="text-[11.5px] leading-snug text-black/50">{POST_DESCRIPTIONS[preset]}</span>
                  </motion.button>
                );
              })}
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                aria-pressed={customPost}
                onClick={() => { setCustomPost(!customPost); setPost(""); }}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-[14px] border p-3.5 text-left transition-colors",
                  customPost ? "border-black bg-[#F6F6F4]" : "border-dashed border-black/20 bg-white hover:border-black/35",
                )}
              >
                <span className="text-[13.5px] font-medium text-black">Custom…</span>
                <span className="text-[11.5px] leading-snug text-black/50">Type your own post</span>
              </motion.button>
            </div>
            <AnimatePresence initial={false}>
              {customPost && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: EASE_OUT }}
                  className="overflow-hidden"
                >
                  <label className="mt-3 block">
                    <span className="sr-only">Custom post</span>
                    <input autoFocus placeholder="e.g. Content Creator" value={post} onChange={(e) => setPost(e.target.value)} className={stepFieldClass} />
                  </label>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-7 flex items-center justify-between">
              <Button variant="secondary" onClick={() => go(1)} disabled={creating}>Back</Button>
              <Button variant="primary" onClick={submit} disabled={creating || !canContinue} data-testid="button-create-member">
                {creating ? "Adding…" : "Add member"}
              </Button>
            </div>
          </motion.div>
        )}

        {step === 3 && created && (
          <motion.div key="step-3" {...slide} className="flex flex-col items-center text-center">
            <motion.span
              initial={reduceMotion ? false : { scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.08 }}
              className="mt-2 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"
            >
              <Check weight="light" size={26} />
            </motion.span>
            <h2 id="add-member-title" className="mt-3.5 text-[22px] font-semibold tracking-[-0.02em] text-black">
              {firstName || "They"} {firstName ? "is" : "are"} in
            </h2>
            <p className="mt-1 text-[13px] text-black/50">Share these login details privately. The password won't be shown again.</p>

            <div className="mt-5 w-full divide-y divide-black/[0.06] overflow-hidden rounded-[14px] bg-[#F6F6F4] text-left">
              {([
                { label: "Email", value: created.email, type: "email" as const },
                { label: "Password", value: created.password, type: "password" as const },
              ]).map(({ label, value, type }) => (
                <div key={type} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-16 shrink-0 text-[12px] text-black/50">{label}</span>
                  <code className="min-w-0 flex-1 truncate text-right font-mono text-[12.5px] text-black">
                    {type === "password" && !showPassword ? "••••••••••••" : value}
                  </code>
                  {type === "password" && (
                    <button
                      type="button"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-black/50 transition-colors hover:text-black"
                    >
                      {showPassword ? <EyeSlash weight="light" size={15} /> : <Eye weight="light" size={15} />}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Copy ${label.toLowerCase()}`}
                    onClick={() => copy(value, type)}
                    className="text-black/50 transition-colors hover:text-black"
                  >
                    {copied === type ? <Check weight="light" size={15} className="text-emerald-600" /> : <Copy weight="light" size={15} />}
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => copy(`Email: ${created.email}\nPassword: ${created.password}`, "both")}
              className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-black/60 transition-colors hover:text-black"
            >
              {copied === "both" ? <Check weight="light" size={14} className="text-emerald-600" /> : <Copy weight="light" size={14} />}
              {copied === "both" ? "Copied" : "Copy both"}
            </button>

            <div className="mt-6 flex w-full items-center justify-between">
              <Button variant="secondary" onClick={reset}>Add another</Button>
              <Button variant="primary" onClick={onClose}>Done</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
