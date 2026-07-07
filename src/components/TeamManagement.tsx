import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "@/components/ui/sonner";
import {
  UserPlus, Trash2, Users, Copy, Check,
  Crown, Eye, EyeOff, ShieldCheck, Lock,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/ios-spinner";
import { PopButton } from "@/components/ui/pop-button";
import { RichButton } from "@/components/ui/rich-button";

interface TeamMember {
  id: string;
  user_id: string;
  role: "admin" | "team_member";
  email?: string;
  org_id?: string;
  created_at?: string;
}

interface GeneratedCredentials {
  email: string;
  password: string;
}

export function TeamManagement() {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatedCredentials, setGeneratedCredentials] = useState<GeneratedCredentials | null>(null);
  const [copied, setCopied] = useState<"email" | "password" | null>(null);
  const [showPassword, setShowPassword] = useState(false);

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

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { toast.error("Enter an email address"); return; }
    if (!user) { toast.error("You must be logged in"); return; }
    setCreating(true);
    setGeneratedCredentials(null);
    try {
      const res = await apiFetch("/api/team-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password: password || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setGeneratedCredentials({ email: data.email, password: data.password });
      toast.success(`Member created: ${data.email}`);
      setEmail(""); setPassword("");
      fetchMembers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create member");
    } finally {
      setCreating(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      const res = await apiFetch(`/api/team-members/${memberId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove member");
      toast.success("Member removed");
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove member");
    }
  };

  const copyToClipboard = async (text: string, type: "email" | "password") => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Member list */}
      <div>
        <div className="flex items-center justify-between mb-1.5 px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/30">
            Members
          </p>
          <p className="text-[11px] text-black/30">{members.length} total</p>
        </div>

        <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-white">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-center justify-center py-10"
              >
                <Spinner className="h-4 w-4 text-black/30" />
              </motion.div>
            ) : members.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.22 }}
                className="flex flex-col items-center justify-center py-10 gap-2"
              >
                <Users className="h-5 w-5 text-black/20" strokeWidth={1.5} />
                <p className="text-[13px] text-black/30">No members yet</p>
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <AnimatePresence initial={false}>
                  {members.map((member, i) => (
                    <motion.div
                      key={member.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12, height: 0, paddingTop: 0, paddingBottom: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.04 }}
                      className={cn(
                        "group flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-black/[0.025]",
                        i !== members.length - 1 && "border-b border-black/[0.06]"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-[11px] font-semibold",
                          member.role === "admin" ? "bg-black" : "bg-black/20"
                        )}>
                          {member.email?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-black truncate">
                            {member.email || `${member.user_id.slice(0, 16)}…`}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {member.role === "admin" ? (
                              <Crown className="h-3 w-3 text-amber-500" strokeWidth={1.8} />
                            ) : (
                              <Users className="h-3 w-3 text-black/30" strokeWidth={1.8} />
                            )}
                            <p className="text-[11px] text-black/40">
                              {member.role === "admin" ? "Admin" : "Team member"}
                            </p>
                          </div>
                        </div>
                      </div>
                      {isAdmin && member.user_id !== user?.id && member.role !== "admin" && (
                        <button
                          onClick={() => handleRemoveMember(member.id)}
                          className="shrink-0 rounded-lg p-1.5 text-black/25 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                          title="Remove"
                          data-testid={`button-remove-member-${member.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Add member — admin only */}
      {isAdmin ? (
        <div>
          <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-black/30">
            Add Member
          </p>
          <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-white px-5 py-4 space-y-4">
            <form onSubmit={handleCreateMember} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-medium text-black/50">Email</label>
                  <input
                    type="email"
                    required
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-10 w-full rounded-[10px] border border-black/[0.08] bg-black/[0.03] px-3 text-[13px] text-black outline-none transition-colors placeholder:text-black/25 focus:border-black/20 focus:ring-1 focus:ring-black/10"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-medium text-black/50">Password <span className="text-black/30">(optional)</span></label>
                  <input
                    type="text"
                    placeholder="Leave blank to auto-generate"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-10 w-full rounded-[10px] border border-black/[0.08] bg-black/[0.03] px-3 text-[13px] text-black outline-none transition-colors placeholder:text-black/25 focus:border-black/20 focus:ring-1 focus:ring-black/10"
                  />
                </div>
              </div>
              <RichButton
                color="default"
                size="default"
                type="submit"
                className="w-full mt-4"
                disabled={creating || !email.trim()}
                data-testid="button-create-member"
              >
                {creating ? <Spinner size="sm" className="mr-2" /> : null}
                {creating ? "Adding…" : "Add Member"}
              </RichButton>
            </form>

            {/* Generated credentials */}
            <AnimatePresence>
              {generatedCredentials && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-black/[0.06] pt-4 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                      <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-[0.12em]">Credentials ready — share securely</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {([
                        { label: "Email", value: generatedCredentials.email, type: "email" as const },
                        { label: "Password", value: generatedCredentials.password, type: "password" as const },
                      ]).map(({ label, value, type }) => (
                        <div key={type} className="space-y-1.5">
                          <p className="text-[11px] font-medium text-black/50">{label}</p>
                          <div className="flex h-10 items-center gap-2 rounded-[10px] border border-black/[0.08] bg-black/[0.03] px-3">
                            <code className="flex-1 truncate font-mono text-[12px] text-black">
                              {type === "password" && !showPassword ? "••••••••••••" : value}
                            </code>
                            {type === "password" && (
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="text-black/30 transition-colors hover:text-black/60"
                              >
                                {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => copyToClipboard(value, type)}
                              className="text-black/30 transition-colors hover:text-black/60"
                            >
                              {copied === type
                                ? <Check className="h-3.5 w-3.5 text-emerald-500" />
                                : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-white px-5 py-4 flex items-center gap-3 text-black/40">
          <Lock className="h-4 w-4 shrink-0" />
          <p className="text-[13px]">Only admins can add or remove team members.</p>
        </div>
      )}
    </div>
  );
}
