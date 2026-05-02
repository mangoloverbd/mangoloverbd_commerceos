import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { RichButton } from "@/registry/spell-ui/rich-button";
import { toast } from "sonner";
import { Eye, EyeOff, ShieldCheck, Loader2, MailCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PrismaHero } from "@/components/ui/prisma-hero";
import { supabase } from "@/integrations/supabase/client";

type Mode = "signin" | "signup";

export default function Auth() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const switchMode = (next: Mode) => {
    setMode(next);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirm(false);
    setEmailSent(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    if (mode === "signup") {
      if (password !== confirmPassword) {
        toast.error("Passwords do not match");
        return;
      }
      if (password.length < 6) {
        toast.error("Password must be at least 6 characters");
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await signIn(email, password);
        if (error) {
          const isUnconfirmed =
            error.message?.toLowerCase().includes("confirm") ||
            error.message?.toLowerCase().includes("not confirmed");
          toast.custom(() => (
            <div className="bg-white border border-black/5 shadow-2xl rounded-2xl p-4 flex items-center gap-4 min-w-[300px]">
              <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-red-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-widest text-black">
                  {isUnconfirmed ? "Email Not Confirmed" : "Authentication Failed"}
                </span>
                <span className="text-sm font-bold text-black">
                  {isUnconfirmed
                    ? "Please check your inbox and confirm your email first."
                    : error.message}
                </span>
              </div>
            </div>
          ));
        } else {
          toast.custom(() => (
            <div className="bg-white border border-black/5 shadow-2xl rounded-2xl p-4 flex items-center gap-4 min-w-[300px]">
              <div className="h-10 w-10 rounded-xl bg-black flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-widest text-black">Welcome Back</span>
                <span className="text-sm font-bold text-black">Successfully signed in</span>
              </div>
            </div>
          ));
          navigate("/");
        }
      } else {
        // Sign up via Supabase — sends a real confirmation email
        const { data, error } = await supabase.auth.signUp({ email, password });

        if (error) {
          const isAlreadyRegistered =
            error.message?.toLowerCase().includes("already") ||
            error.message?.toLowerCase().includes("registered") ||
            error.message?.toLowerCase().includes("exists");
          if (isAlreadyRegistered) {
            toast.custom(() => (
              <div className="bg-white border border-black/5 shadow-2xl rounded-2xl p-4 flex items-center gap-4 min-w-[300px]">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-amber-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-black">Email Already Registered</span>
                  <span className="text-sm font-bold text-black">This email has an account — please sign in instead</span>
                </div>
              </div>
            ));
            switchMode("signin");
          } else {
            toast.custom(() => (
              <div className="bg-white border border-black/5 shadow-2xl rounded-2xl p-4 flex items-center gap-4 min-w-[300px]">
                <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-red-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-black">Sign Up Failed</span>
                  <span className="text-sm font-bold text-black">{error.message || "Failed to create account"}</span>
                </div>
              </div>
            ));
          }
          return;
        }

        // Supabase returns identities: [] when email already exists but is confirmed
        // (it silently "succeeds" without sending another email)
        const identities = data.user?.identities ?? [];
        if (identities.length === 0) {
          toast.custom(() => (
            <div className="bg-white border border-black/5 shadow-2xl rounded-2xl p-4 flex items-center gap-4 min-w-[300px]">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-amber-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-widest text-black">Email Already Registered</span>
                <span className="text-sm font-bold text-black">This email has an account — please sign in instead</span>
              </div>
            </div>
          ));
          switchMode("signin");
          return;
        }

        // Account created — show confirmation screen
        setEmailSent(true);
      }
    } catch (err) {
      console.error(err);
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const smooth = { ease: [0.22, 1, 0.36, 1] as const };

  return (
    <div className="min-h-screen w-full lg:grid lg:grid-cols-2 bg-white">
      {/* ── Left — PrismaHero panel ── */}
      <div className="relative hidden lg:flex">
        <PrismaHero />
      </div>

      {/* ── Right — auth form ── */}
      <motion.div
        className="flex min-h-screen items-center justify-center px-8 py-16 lg:px-20 bg-white"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ...smooth, delay: 0.1 }}
      >
        <div className="w-full max-w-sm flex flex-col items-center">

          {/* Logo */}
          <motion.div
            className="flex items-center gap-3 mb-12"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ...smooth, delay: 0.2 }}
          >
            <div className="h-8 w-8 bg-black rounded-lg flex items-center justify-center">
              <div className="h-4 w-4 bg-white rounded-sm" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-black">Arc Lab Technology</span>
          </motion.div>

          <AnimatePresence mode="wait">
            {/* ── Email confirmation screen ── */}
            {emailSent ? (
              <motion.div
                key="email-sent"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.45, ...smooth }}
                className="w-full flex flex-col items-center text-center space-y-6"
              >
                <div className="h-16 w-16 bg-black rounded-2xl flex items-center justify-center">
                  <MailCheck className="w-7 h-7 text-white" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold tracking-tight text-black">Check your email</h2>
                  <p className="text-sm text-black/60 font-light leading-relaxed">
                    We sent a confirmation link to<br />
                    <span className="font-semibold text-black">{email}</span>
                  </p>
                </div>
                <div className="w-full border border-black/[0.08] bg-[#F8F8F6] rounded-xl p-4 text-left space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-black">Next steps</p>
                  <p className="text-xs text-black/60 leading-relaxed">
                    Open the email and click <span className="font-semibold text-black">Confirm your mail</span>. You'll be signed in automatically and redirected to set up your workspace.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/40 hover:text-black transition-colors"
                >
                  Back to sign in
                </button>
              </motion.div>
            ) : (
              /* ── Auth form ── */
              <motion.div
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="w-full flex flex-col items-center"
              >
                {/* Headline */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={mode}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.35, ...smooth }}
                    className="mb-8 space-y-2 text-center w-full"
                  >
                    <h1 className="text-3xl font-bold tracking-tight text-black">
                      {mode === "signin" ? "Sign In or Join Now!" : "Create your account"}
                    </h1>
                    <p className="text-sm text-black font-light">
                      {mode === "signin"
                        ? "Login or create your Arc Lab account."
                        : "Sign up to get started with Arc Lab Technology."}
                    </p>
                  </motion.div>
                </AnimatePresence>

                {/* Mode tabs */}
                <div className="flex items-center gap-1 p-1 bg-black/[0.04] rounded-xl mb-8">
                  {(["signin", "signup"] as Mode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => switchMode(m)}
                      className={`px-5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-200 ${
                        mode === m
                          ? "bg-black text-white shadow-sm"
                          : "text-black hover:text-black"
                      }`}
                    >
                      {m === "signin" ? "Sign In" : "Sign Up"}
                    </button>
                  ))}
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-5 w-full">
                  {/* Email */}
                  <div className="space-y-2">
                    <label className="block text-center text-[9px] font-bold uppercase tracking-[0.25em] text-black">
                      Email Address
                    </label>
                    <Input
                      type="email"
                      placeholder="name@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-12 bg-[#F8F8F6] border-black/[0.08] focus-visible:ring-1 focus-visible:ring-black focus-visible:border-black rounded-xl text-sm placeholder:text-black transition-all"
                      required
                    />
                  </div>

                  {/* Password */}
                  <div className="space-y-2">
                    <label className="block text-center text-[9px] font-bold uppercase tracking-[0.25em] text-black">
                      Password
                    </label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-12 bg-[#F8F8F6] border-black/[0.08] focus-visible:ring-1 focus-visible:ring-black focus-visible:border-black rounded-xl pr-12 text-sm placeholder:text-black transition-all"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-black hover:text-black transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm password — signup only */}
                  <AnimatePresence>
                    {mode === "signup" && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden space-y-2"
                      >
                        <label className="block text-center text-[9px] font-bold uppercase tracking-[0.25em] text-black">
                          Confirm Password
                        </label>
                        <div className="relative">
                          <Input
                            type={showConfirm ? "text" : "password"}
                            placeholder="••••••••"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="h-12 bg-[#F8F8F6] border-black/[0.08] focus-visible:ring-1 focus-visible:ring-black focus-visible:border-black rounded-xl pr-12 text-sm placeholder:text-black transition-all"
                            required={mode === "signup"}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirm(!showConfirm)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-black hover:text-black transition-colors"
                          >
                            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Submit */}
                  <div className="pt-2">
                    <RichButton
                      type="submit"
                      disabled={loading}
                      className="w-full h-12 text-[10px] font-bold uppercase tracking-[0.3em] rounded-xl"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {mode === "signin" ? "Signing In…" : "Creating Account…"}
                        </>
                      ) : (
                        mode === "signin" ? "Sign In" : "Create Account"
                      )}
                    </RichButton>
                  </div>
                </form>

                {/* Footer */}
                <div className="mt-8 text-center space-y-3 w-full">
                  <p className="text-xs text-black">
                    {mode === "signin" ? (
                      <>
                        Don&apos;t have an account?{" "}
                        <button
                          type="button"
                          onClick={() => switchMode("signup")}
                          className="font-semibold text-black underline underline-offset-2 hover:text-black transition-colors"
                        >
                          Sign up
                        </button>
                      </>
                    ) : (
                      <>
                        Already have an account?{" "}
                        <button
                          type="button"
                          onClick={() => switchMode("signin")}
                          className="font-semibold text-black underline underline-offset-2 hover:text-black transition-colors"
                        >
                          Sign in
                        </button>
                      </>
                    )}
                  </p>
                  <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-black">
                    Secure Authentication
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </motion.div>
    </div>
  );
}
