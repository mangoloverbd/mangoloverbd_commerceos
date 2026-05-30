import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button7 } from "@/components/ui/button-7";
import { toast } from "sonner";
import { Eye, EyeOff, ShieldCheck, MailCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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

  const smooth = { ease: [0.22, 1, 0.36, 1] as const };

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center overflow-hidden bg-[#DEDEDE]">

      {/* Glass card */}
      <div className="relative z-10 flex items-center mx-4">
      <motion.div
        className="relative w-[480px] rounded-3xl px-10 py-7"
        layout
        style={{
          background: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
          border: "1px solid rgba(255, 255, 255, 0.6)",
          boxShadow: "0 0 0 0.5px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.04), 0 12px 40px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.02)",
        }}
        initial={{ opacity: 0, y: 32, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ...smooth }}
      >
        {/* Subtle inner shine line at top */}
        <div
          className="absolute top-0 left-8 right-8 h-px rounded-full"
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.95), transparent)" }}
        />

        <div className="w-full flex flex-col">
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
                <div className="h-16 w-16 rounded-2xl flex items-center justify-center"
                  style={{ background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.08)" }}>
                  <MailCheck className="w-7 h-7 text-black" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold tracking-tight text-black">Check your email</h2>
                  <p className="text-sm text-black/70 font-light leading-relaxed">
                    We sent a confirmation link to<br />
                    <span className="font-semibold text-black">{email}</span>
                  </p>
                </div>
                <div className="w-full rounded-xl p-4 text-left space-y-1"
                  style={{ background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-black/50">Next steps</p>
                  <p className="text-xs text-black/50 leading-relaxed">
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
                className="w-full flex flex-col"
              >
                {/* Headline */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={mode}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.35, ...smooth }}
                    className="mb-6 space-y-1 text-center w-full"
                  >
                    {/* Favicon logo */}
                    <div className="flex justify-center mb-4">
                      <img
                        src="/favicon.svg"
                        alt="Seraphine logo"
                        className="w-12 h-12"
                      />
                    </div>
                    <h1
                      className="text-[32px] font-semibold leading-[1.08] tracking-normal text-black drop-shadow-sm"
                      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif" }}
                    >
                      {mode === "signin" ? "Sign In or Join Now!" : "Create your account"}
                    </h1>
                    <p
                      className="text-[15px] font-normal leading-6 tracking-normal text-black/70"
                      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif" }}
                    >
                      {mode === "signin"
                        ? "Login or create your Arc Lab account."
                        : "Sign up to get started with Arc Lab Technology."}
                    </p>
                  </motion.div>
                </AnimatePresence>

                {/* Mode tabs */}
                <div className="mb-6 grid w-full grid-cols-2 gap-2 py-2"
                  style={{ borderTop: "1px solid rgba(0,0,0,0.06)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                  {(["signin", "signup"] as Mode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => switchMode(m)}
                      className={`h-9 rounded-lg text-[8px] font-medium uppercase tracking-[0.3em] transition-all duration-200 ${
                        mode === m
                          ? "text-black"
                          : "text-black/35 hover:text-black/60"
                      }`}
                      style={mode === m ? {
                        background: "rgba(0,0,0,0.05)",
                        border: "1px solid rgba(0,0,0,0.08)",
                      } : {
                        background: "transparent",
                        border: "1px solid transparent",
                      }}
                    >
                      {m === "signin" ? "Sign In" : "Sign Up"}
                    </button>
                  ))}
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4 w-full">
                  {/* Email */}
                  <div className="space-y-2">
                    <label className="block text-center text-[9px] font-bold uppercase tracking-[0.25em] text-black/50">
                      Email Address
                    </label>
                    <Input
                      type="email"
                      placeholder="name@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-12 rounded-xl text-sm text-black placeholder:text-black/30 border-0 focus-visible:ring-1 focus-visible:ring-black/20 focus-visible:outline-none transition-all"
                      style={{
                        background: "rgba(0,0,0,0.03)",
                        border: "1px solid rgba(0,0,0,0.08)",
                      }}
                      required
                    />
                  </div>

                  {/* Password */}
                  <div className="space-y-2">
                    <label className="block text-center text-[9px] font-bold uppercase tracking-[0.25em] text-black/50">
                      Password
                    </label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-12 rounded-xl pr-12 text-sm text-black placeholder:text-black/30 border-0 focus-visible:ring-1 focus-visible:ring-black/20 focus-visible:outline-none transition-all"
                        style={{
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,120,120,0.25)",
                        }}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-black/30 hover:text-black/60 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Remember me — signin only */}
                  <AnimatePresence initial={false}>
                    {mode === "signin" && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="flex items-center justify-between pt-3">
                          <label className="flex cursor-pointer select-none items-center gap-2 text-[9px] font-medium uppercase tracking-[0.2em] text-black/45 transition-colors hover:text-black">
                            <Checkbox
                              checked={rememberMe}
                              onCheckedChange={(checked) => setRememberMe(checked === true)}
                              className="h-3.5 w-3.5 rounded border-black/10 data-[state=checked]:border-red-400 data-[state=checked]:bg-red-500 data-[state=checked]:text-black [&_svg]:h-3 [&_svg]:w-3"
                            />
                            Remember me
                          </label>
                          <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-black/25">
                            Secure
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Confirm password — signup only */}
                  <AnimatePresence initial={false}>
                    {mode === "signup" && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden space-y-2"
                      >
                        <label className="block text-center text-[9px] font-bold uppercase tracking-[0.25em] text-black/50">
                          Confirm Password
                        </label>
                        <div className="relative">
                          <Input
                            type={showConfirm ? "text" : "password"}
                            placeholder="••••••••"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="h-12 rounded-xl pr-12 text-sm text-black placeholder:text-black/30 border-0 focus-visible:ring-1 focus-visible:ring-black/20 focus-visible:outline-none transition-all"
                            style={{
                              background: "rgba(255,255,255,0.08)",
                              border: "1px solid rgba(255,120,120,0.25)",
                            }}
                            required={mode === "signup"}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirm(!showConfirm)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-black/30 hover:text-black/60 transition-colors"
                          >
                            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Submit */}
                  <div className="pt-2">
                    <Button7
                      type="submit"
                      disabled={loading}
                      fullWidth
                      label={
                        loading
                          ? mode === "signin"
                            ? "Signing In..."
                            : "Creating..."
                          : mode === "signin"
                            ? "Sign In"
                            : "Create Account"
                      }
                    />
                  </div>
                </form>

                {/* Footer */}
                <div className="mt-6 text-center space-y-2 w-full">
                  <p className="text-xs text-black/60">
                    {mode === "signin" ? (
                      <>
                        Don&apos;t have an account?{" "}
                        <button
                          type="button"
                          onClick={() => switchMode("signup")}
                          className="font-semibold text-black hover:text-black/50 underline underline-offset-2 transition-colors"
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
                          className="font-semibold text-black hover:text-black/50 underline underline-offset-2 transition-colors"
                        >
                          Sign in
                        </button>
                      </>
                    )}
                  </p>
                  <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-black/30">
                    Secure Authentication
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      </div>
    </div>
  );
}
