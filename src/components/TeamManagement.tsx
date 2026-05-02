import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  UserPlus, Trash2, Users, Copy, Check,
  Eye, EyeOff, ShieldCheck, Loader2,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface TeamMember {
  id: string;
  user_id: string;
  role: "admin" | "team_member";
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
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      setMembers(data || []);
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
      const res = await apiFetch("/api/create-team-member", {
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
      const { error } = await supabase.from("user_roles").delete().eq("id", memberId);
      if (error) throw error;
      toast.success("Member removed");
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch {
      toast.error("Failed to remove member");
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
      className="border border-black/[0.07] bg-white"
    >
      {/* Panel header */}
      <div className="flex items-center justify-between px-8 py-3 border-b border-black/[0.05]">
        <div className="flex items-center gap-2.5">
          <Users className="h-3 w-3 text-black" />
          <span className="text-[8px] font-medium tracking-[0.3em] text-black uppercase">Team Management</span>
        </div>
        <span className="text-[8px] font-medium tracking-[0.2em] text-black uppercase">{members.length} members</span>
      </div>

      {/* Add member form */}
      <div className="px-8 py-5 border-b border-black/[0.05]">
        <p className="text-[8px] font-medium tracking-[0.25em] text-black uppercase mb-4">Add New Member</p>
        <form onSubmit={handleCreateMember}>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-[8px] tracking-[0.2em] text-black uppercase">Email</label>
              <input
                type="email"
                required
                placeholder="name@angonaloy.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-9 px-3 bg-[#FAFAF8] border border-black/[0.08] text-sm text-black placeholder:text-black outline-none focus:border-black/20 transition-colors font-light"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="text-[8px] tracking-[0.2em] text-black uppercase">Password (optional)</label>
              <input
                type="text"
                placeholder="Leave blank to auto-generate"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-9 px-3 bg-[#FAFAF8] border border-black/[0.08] text-sm text-black placeholder:text-black outline-none focus:border-black/20 transition-colors font-light"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-1.5 h-9 px-5 bg-black text-white text-[9px] font-medium tracking-[0.2em] uppercase disabled:opacity-40 transition-opacity shrink-0"
              data-testid="button-create-member"
            >
              {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
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
              <div className="mt-4 pt-4 border-t border-black/[0.05]">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck className="h-3 w-3 text-emerald-600" />
                  <span className="text-[8px] font-medium tracking-[0.2em] text-emerald-600 uppercase">Credentials Generated</span>
                </div>
                <div className="flex gap-3">
                  {[
                    { label: "Email", value: generatedCredentials.email, type: "email" as const },
                    { label: "Password", value: generatedCredentials.password, type: "password" as const },
                  ].map(({ label, value, type }) => (
                    <div key={type} className="flex-1 space-y-1.5">
                      <span className="text-[8px] tracking-[0.2em] text-black uppercase">{label}</span>
                      <div className="flex items-center gap-1.5 h-9 px-3 bg-[#FAFAF8] border border-black/[0.08]">
                        <code className="flex-1 text-xs font-mono text-black truncate">
                          {type === "password" && !showPassword ? "••••••••••••" : value}
                        </code>
                        {type === "password" && (
                          <button onClick={() => setShowPassword(!showPassword)} className="text-black hover:text-black transition-colors">
                            {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </button>
                        )}
                        <button onClick={() => copyToClipboard(value, type)} className="text-black hover:text-black transition-colors">
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
          <Loader2 className="h-4 w-4 animate-spin text-black" />
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <Users className="h-5 w-5 text-black" />
          <p className="text-[9px] tracking-[0.2em] text-black uppercase">No members yet</p>
        </div>
      ) : (
        <div className="divide-y divide-black/[0.04]">
          {members.map((member) => (
            <div key={member.id} className="group flex items-center justify-between px-8 py-4 hover:bg-black/[0.01] transition-colors">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "h-6 w-6 flex items-center justify-center",
                  member.role === "admin" ? "bg-black" : "bg-black/[0.05]"
                )}>
                  <Users className={cn("h-3 w-3", member.role === "admin" ? "text-white" : "text-black")} />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs text-black">{member.user_id.slice(0, 16)}…</span>
                    <span className={cn(
                      "text-[7px] font-bold tracking-[0.15em] uppercase px-1.5 py-0.5",
                      member.role === "admin" ? "bg-black text-white" : "bg-black/[0.05] text-black"
                    )}>
                      {member.role === "admin" ? "Admin" : "Member"}
                    </span>
                  </div>
                </div>
              </div>
              {member.user_id !== user?.id && member.role !== "admin" && (
                <button
                  onClick={() => handleRemoveMember(member.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-black hover:text-red-500 transition-all"
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
