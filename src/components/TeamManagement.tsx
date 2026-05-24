import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  UserPlus, Trash2, Users, Copy, Check, UserRoundCog, Crown,
  Eye, EyeOff, ShieldCheck,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/ios-spinner";
import { AnimatedText } from "@/components/ui/animated-text";

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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="overflow-hidden rounded-2xl border border-black/10 bg-white"
    >
      {/* Panel header */}
      <div className="flex h-[50px] items-center justify-between border-b border-black/10 px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
            <UserRoundCog className="h-4 w-4" strokeWidth={1.8} />
          </span>
          <AnimatedText className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Team Management</AnimatedText>
        </div>
        <span className="text-xs font-medium text-muted-foreground">{members.length} members</span>
      </div>

      {/* Add member form */}
      <div className="border-b border-black/10 px-6 py-4">
        <p className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Add New Member</p>
        <form onSubmit={handleCreateMember}>
          <div className="grid items-end gap-3 lg:grid-cols-[1fr_1fr_auto]">
            <div className="flex-1 space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Email</label>
              <input
                type="email"
                required
                placeholder="name@angonaloy.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9 w-full rounded-xl border-0 bg-black/[0.055] px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:ring-1 focus:ring-black/20"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Password (optional)</label>
              <input
                type="text"
                placeholder="Leave blank to auto-generate"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-9 w-full rounded-xl border-0 bg-black/[0.055] px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:ring-1 focus:ring-black/20"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-black px-5 text-sm font-medium text-white transition-colors hover:bg-black/85 disabled:opacity-40"
              data-testid="button-create-member"
            >
              {creating ? <Spinner size="sm" /> : <UserPlus className="h-3 w-3" />}
              Add
            </button>
          </div>
        </form>

        <AnimatePresence>
          {generatedCredentials && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 border-t border-black/10 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck className="h-3 w-3 text-emerald-600" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-600">Credentials Generated</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    { label: "Email", value: generatedCredentials.email, type: "email" as const },
                    { label: "Password", value: generatedCredentials.password, type: "password" as const },
                  ].map(({ label, value, type }) => (
                    <div key={type} className="flex-1 space-y-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
                      <div className="flex h-10 items-center gap-1.5 rounded-xl bg-black/[0.055] px-3">
                        <code className="flex-1 truncate font-mono text-xs text-foreground">
                          {type === "password" && !showPassword ? "••••••••••••" : value}
                        </code>
                        {type === "password" && (
                          <button onClick={() => setShowPassword(!showPassword)} className="text-muted-foreground transition-colors hover:text-foreground">
                            {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </button>
                        )}
                        <button onClick={() => copyToClipboard(value, type)} className="text-muted-foreground transition-colors hover:text-foreground">
                          {copied === type ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
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

      {/* Member list */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <Users className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">No members yet</p>
        </div>
      ) : (
        <div className="divide-y divide-black/10">
          {members.map((member) => (
            <div key={member.id} className="group flex items-center justify-between px-6 py-3 transition-colors hover:bg-black/[0.025]">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-xl",
                  member.role === "admin" ? "bg-amber-100 text-amber-700" : "bg-violet-100 text-violet-700"
                )}>
                  {member.role === "admin" ? (
                    <Crown className="h-3.5 w-3.5" strokeWidth={1.8} />
                  ) : (
                    <Users className="h-3.5 w-3.5" strokeWidth={1.8} />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs text-foreground">{member.email || `${member.user_id.slice(0, 16)}…`}</span>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      member.role === "admin" ? "bg-black text-white" : "bg-black/[0.06] text-muted-foreground"
                    )}>
                      {member.role === "admin" ? "Admin" : "Member"}
                    </span>
                  </div>
                </div>
              </div>
              {member.user_id !== user?.id && member.role !== "admin" && (
                <button
                  onClick={() => handleRemoveMember(member.id)}
                  className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                  title="Remove"
                  data-testid={`button-remove-member-${member.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
