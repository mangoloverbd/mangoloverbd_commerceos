import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Eye, EyeOff, MailCheck, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "@/components/ui/sparkles";

type Mode = "signin" | "signup";
const rememberedEmailKey = "seraphine:remembered-email";

export default function Auth() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const rememberedEmail = window.localStorage.getItem(rememberedEmailKey);
    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberMe(true);
    }
  }, []);

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
          if (rememberMe) {
            window.localStorage.setItem(rememberedEmailKey, email);
          } else {
            window.localStorage.removeItem(rememberedEmailKey);
          }

          navigate("/");
        }
      } else {
        const registerRes = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const registerData = await registerRes.json();
        const error = registerRes.ok ? null : new Error(registerData.error || "Failed to create account");

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

        const { error: signInError } = await signIn(email, password);
        if (signInError) {
          toast.success("Account created. Please sign in to continue.");
          switchMode("signin");
          return;
        }

        toast.custom(() => (
          <div className="bg-white border border-black/5 shadow-2xl rounded-2xl p-4 flex items-center gap-4 min-w-[300px]">
            <div className="h-10 w-10 rounded-xl bg-red-700 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-black" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-widest text-black">Workspace Created</span>
              <span className="text-sm font-bold text-black">Your owner account is ready</span>
            </div>
          </div>
        ));
        navigate("/");
      }
    } catch (err) {
      console.error(err);
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center overflow-hidden bg-[#050505]">
      {/* Subtle ambient glow */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[radial-gradient(ellipse,rgba(255,255,255,0.015),transparent_70%)]" />
        <Sparkles
          density={200}
          size={0.5}
          speed={0.15}
          opacity={0.25}
          className="absolute inset-0 h-full w-full"
          color="#ffffff"
        />
      </div>

      <div className="relative z-10 w-full max-w-[420px] mx-6">
        <AnimatePresence mode="wait">
          {emailSent ? (
            <motion.div
              key="email-sent"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center text-center space-y-10"
            >
              <div className="space-y-4">
                <MailCheck className="w-8 h-8 text-white/60 mx-auto" strokeWidth={1.2} />
                <h2 className="text-[28px] font-light tracking-[-0.04em] text-white">Check your inbox</h2>
                <p className="text-[13px] text-white/35 font-light leading-relaxed max-w-[300px] mx-auto">
                  We sent a link to <span className="text-white/70">{email}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className="text-[10px] uppercase tracking-[0.3em] text-white/25 hover:text-white/50 transition-colors duration-500"
              >
                Return to sign in
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col"
            >
              {/* Header — no card, just floating content */}
              <div className="text-center mb-12">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={mode}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                  >
                    <h1
                      className="text-[32px] font-extralight tracking-[-0.04em] text-white mb-2"
                      style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
                    >
                      {mode === "signin" ? "Welcome" : "Begin"}
                    </h1>
                    <p className="text-[12px] text-white/30 tracking-[0.15em] uppercase font-light">
                      {mode === "signin" ? "Sign in to continue" : "Create your account"}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Thin gold accent line */}
              <div className="w-8 h-px bg-gradient-to-r from-transparent via-[#c9a96e] to-transparent mx-auto mb-10" />

              {/* Mode switcher — text only, no box */}
              <div className="flex justify-center gap-8 mb-10">
                {(["signin", "signup"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => switchMode(m)}
                    className={`text-[10px] uppercase tracking-[0.25em] transition-all duration-500 pb-2 border-b ${
                      mode === m
                        ? "text-white/80 border-white/30"
                        : "text-white/20 border-transparent hover:text-white/40"
                    }`}
                  >
                    {m === "signin" ? "Sign In" : "Sign Up"}
                  </button>
                ))}
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <label htmlFor="email" className="text-[10px] text-white/25 uppercase tracking-[0.2em] font-light">Email</label>
                  <input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-12 bg-transparent border-0 border-b border-white/[0.08] text-[14px] text-white font-light placeholder:text-white/15 focus:outline-none focus:border-white/25 transition-colors duration-500 px-0"
                    required
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="password" className="text-[10px] text-white/25 uppercase tracking-[0.2em] font-light">Password</label>
                  <div className="relative">
                    <input
                      id="password"
                      placeholder="Enter password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full h-12 bg-transparent border-0 border-b border-white/[0.08] text-[14px] text-white font-light placeholder:text-white/15 focus:outline-none focus:border-white/25 transition-colors duration-500 px-0 pr-9"
                      required
                    />
                    <button
                      className="text-white/15 hover:text-white/40 absolute inset-y-0 end-0 flex items-center transition-colors duration-300"
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={14} strokeWidth={1.2} /> : <Eye size={14} strokeWidth={1.2} />}
                    </button>
                  </div>
                </div>

                {/* Confirm password — signup only */}
                <AnimatePresence initial={false}>
                  {mode === "signup" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-col gap-2">
                        <label htmlFor="confirm-password" className="text-[10px] text-white/25 uppercase tracking-[0.2em] font-light">Confirm</label>
                        <div className="relative">
                          <input
                            id="confirm-password"
                            placeholder="Re-enter password"
                            type={showConfirm ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full h-12 bg-transparent border-0 border-b border-white/[0.08] text-[14px] text-white font-light placeholder:text-white/15 focus:outline-none focus:border-white/25 transition-colors duration-500 px-0 pr-9"
                            required={mode === "signup"}
                          />
                          <button
                            className="text-white/15 hover:text-white/40 absolute inset-y-0 end-0 flex items-center transition-colors duration-300"
                            type="button"
                            onClick={() => setShowConfirm(!showConfirm)}
                          >
                            {showConfirm ? <EyeOff size={14} strokeWidth={1.2} /> : <Eye size={14} strokeWidth={1.2} />}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Remember me */}
                {mode === "signin" && (
                  <div className="flex items-center gap-2.5 pt-1">
                    <Checkbox
                      id="keep-me-logged-in"
                      checked={rememberMe}
                      onCheckedChange={(checked) => setRememberMe(checked === true)}
                      className="border-white/15 data-[state=checked]:bg-white/80 data-[state=checked]:text-black h-3 w-3 rounded-sm"
                    />
                    <label htmlFor="keep-me-logged-in" className="cursor-pointer text-white/25 text-[11px] tracking-wide">
                      Remember me
                    </label>
                  </div>
                )}

                {/* CTA */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-[52px] mt-4 border border-white/[0.12] rounded-none text-[11px] uppercase tracking-[0.3em] text-white/80 font-light hover:bg-white/[0.04] hover:border-white/25 disabled:opacity-30 transition-all duration-500"
                >
                  {loading
                    ? mode === "signin" ? "Authenticating..." : "Creating..."
                    : mode === "signin" ? "Continue" : "Create Account"}
                </button>
              </form>

              {/* Footer */}
              <div className="mt-10 text-center">
                <p className="text-[11px] text-white/20 tracking-wide">
                  {mode === "signin" ? (
                    <>
                      New here?{" "}
                      <button type="button" onClick={() => switchMode("signup")} className="text-white/40 hover:text-white/70 transition-colors duration-500">
                        Create account
                      </button>
                    </>
                  ) : (
                    <>
                      Have an account?{" "}
                      <button type="button" onClick={() => switchMode("signin")} className="text-white/40 hover:text-white/70 transition-colors duration-500">
                        Sign in
                      </button>
                    </>
                  )}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
