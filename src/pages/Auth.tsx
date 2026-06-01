import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Eye, EyeOff, MailCheck, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "@/components/ui/sparkles";
import { AuthTestimonial } from "@/components/ui/auth-testimonial";

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
    <div className="min-h-screen w-full relative flex overflow-hidden bg-[#FAFAF8]" style={{ fontFamily: "'Suisse Intl', 'Geist Sans', system-ui, sans-serif" }}>
      {/* Left panel — testimonial */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-[#f5f5f3]">
        {/* Sparkles on left panel */}
        <div className="absolute inset-0">
          <Sparkles
            density={100}
            size={0.4}
            speed={0.1}
            opacity={0.15}
            className="absolute inset-0 h-full w-full"
            color="#000000"
          />
        </div>
        <div className="relative z-10 w-full">
          <AuthTestimonial />
        </div>
        {/* Right edge divider */}
        <div className="absolute right-0 top-[15%] bottom-[15%] w-px bg-gradient-to-b from-transparent via-black/[0.06] to-transparent" />
      </div>

      {/* Right panel — auth form */}
      <div className="flex-1 flex items-center justify-center relative">
        <div className="absolute inset-0" />

        <div className="relative z-10 w-full max-w-[380px] mx-8">
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
                  <MailCheck className="w-8 h-8 text-black/50 mx-auto" strokeWidth={1.2} />
                  <h2 className="text-[28px] font-light tracking-[-0.04em] text-black">Check your inbox</h2>
                  <p className="text-[13px] text-black/40 font-light leading-relaxed max-w-[300px] mx-auto">
                    We sent a link to <span className="text-black/70">{email}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className="text-[10px] uppercase tracking-[0.3em] text-black/25 hover:text-black/50 transition-colors duration-500"
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
                        className="text-[32px] font-extralight tracking-[-0.04em] text-black mb-2"
                        style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
                      >
                        {mode === "signin" ? "Welcome" : "Begin"}
                      </h1>
                      <p className="text-[12px] text-black/30 tracking-[0.15em] uppercase font-light">
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
                          ? "text-black/80 border-black/30"
                          : "text-black/20 border-transparent hover:text-black/40"
                      }`}
                    >
                      {m === "signin" ? "Sign In" : "Sign Up"}
                    </button>
                  ))}
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="email" className="text-[10px] text-black/35 uppercase tracking-[0.2em] font-light">Email</label>
                    <input
                      id="email"
                      type="email"
                      placeholder="name@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-[44px] bg-white border border-black/[0.12] rounded-[10px] text-[14px] text-black placeholder:text-black/30 focus:outline-none focus:ring-2 focus:ring-[#0171E3]/20 focus:border-[#0171E3]/40 transition-all duration-200 px-4"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label htmlFor="password" className="text-[10px] text-black/35 uppercase tracking-[0.2em] font-light">Password</label>
                    <div className="relative">
                      <input
                        id="password"
                        placeholder="Enter password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full h-[44px] bg-white border border-black/[0.12] rounded-[10px] text-[14px] text-black placeholder:text-black/30 focus:outline-none focus:ring-2 focus:ring-[#0171E3]/20 focus:border-[#0171E3]/40 transition-all duration-200 px-4 pr-11"
                        required
                      />
                      <button
                        className="text-black/30 hover:text-black/60 absolute top-1/2 -translate-y-1/2 right-4 transition-colors duration-200"
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
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
                          <label htmlFor="confirm-password" className="text-[10px] text-black/35 uppercase tracking-[0.2em] font-light">Confirm</label>
                          <div className="relative">
                            <input
                              id="confirm-password"
                              placeholder="Re-enter password"
                              type={showConfirm ? "text" : "password"}
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              className="w-full h-[44px] bg-white border border-black/[0.12] rounded-[10px] text-[14px] text-black placeholder:text-black/30 focus:outline-none focus:ring-2 focus:ring-[#0171E3]/20 focus:border-[#0171E3]/40 transition-all duration-200 px-4 pr-11"
                              required={mode === "signup"}
                            />
                            <button
                              className="text-black/30 hover:text-black/60 absolute top-1/2 -translate-y-1/2 right-4 transition-colors duration-200"
                              type="button"
                              onClick={() => setShowConfirm(!showConfirm)}
                            >
                              {showConfirm ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
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
                        className="border-black/15 data-[state=checked]:bg-black data-[state=checked]:border-black data-[state=checked]:text-white h-3.5 w-3.5 rounded-none"
                      />
                      <label htmlFor="keep-me-logged-in" className="cursor-pointer text-black/35 text-[11px] tracking-wide">
                        Remember me
                      </label>
                    </div>
                  )}

                  {/* CTA */}
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-4"
                    size="lg"
                  >
                    {loading
                      ? mode === "signin" ? "Authenticating..." : "Creating..."
                      : mode === "signin" ? "Continue" : "Create Account"}
                  </Button>
                </form>

                {/* Footer */}
                <div className="mt-10 text-center">
                  <p className="text-[11px] text-black/30 tracking-wide">
                    {mode === "signin" ? (
                      <>
                        New here?{" "}
                        <button type="button" onClick={() => switchMode("signup")} className="text-black/50 hover:text-black transition-colors duration-500">
                          Create account
                        </button>
                      </>
                    ) : (
                      <>
                        Have an account?{" "}
                        <button type="button" onClick={() => switchMode("signin")} className="text-black/50 hover:text-black transition-colors duration-500">
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
    </div>
  );
}
