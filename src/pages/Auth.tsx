import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { RichButton } from "@/components/ui/rich-button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast, DarkToast } from "@/components/ui/sonner";
import { Eye, EyeOff, MailCheck, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AuthTestimonial } from "@/components/ui/auth-testimonial";
import { Sparkles } from "@/components/ui/sparkles";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/logo";

type Mode = "signin" | "signup";
const rememberedEmailKey = "merchantsuite:remembered-email";

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
            <DarkToast className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-red-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">
                  {isUnconfirmed ? "Email Not Confirmed" : "Authentication Failed"}
                </span>
                <span className="text-sm font-bold text-white">
                  {isUnconfirmed
                    ? "Please check your inbox and confirm your email first."
                    : error.message}
                </span>
              </div>
            </DarkToast>
          ), { fit: true });
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
              <DarkToast className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-amber-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Email Already Registered</span>
                  <span className="text-sm font-bold text-white">This email has an account — please sign in instead</span>
                </div>
              </DarkToast>
            ), { fit: true });
            switchMode("signin");
          } else {
            toast.custom(() => (
              <DarkToast className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-red-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Sign Up Failed</span>
                  <span className="text-sm font-bold text-white">{error.message || "Failed to create account"}</span>
                </div>
              </DarkToast>
            ), { fit: true });
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
          <DarkToast className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Workspace Created</span>
              <span className="text-sm font-bold text-white">Your owner account is ready</span>
            </div>
          </DarkToast>
        ), { fit: true });
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
      <div className="flex-1 flex flex-col items-center justify-center relative px-8">
        <div className="absolute inset-0" />

        <div className="relative z-10 w-full max-w-[430px] flex flex-col items-center">
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
                  <h2 className="text-[28px] font-bold tracking-[-0.02em] text-black">Check your inbox</h2>
                  <p className="text-[13px] text-black/40 leading-relaxed max-w-[300px] mx-auto">
                    We sent a link to <span className="text-black font-bold">{email}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className="text-[11px] uppercase tracking-[0.25em] text-black/30 font-bold hover:text-black/60 transition-colors duration-300"
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
                className="flex flex-col items-center w-full"
              >
                {/* Logo — matches sidebar header */}
                <div className="mb-10 flex items-center gap-1">
                  <Logo className="h-[21px] w-auto shrink-0" />
                  <span className="text-[21px] font-bold tracking-tight text-[#111] antialiased">
                    Mango Lover BD Suite
                  </span>
                </div>

                {/* Card container */}
                <div className="w-full bg-white rounded-md border border-black/[0.06] shadow-sm p-8 sm:p-10">
                  {/* Form */}
                  <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    {/* Email */}
                    <div className="flex flex-col gap-2">
                      <label htmlFor="email" className="text-[13px] font-semibold text-black">
                        Email Address
                      </label>
                      <input
                        id="email"
                        type="email"
                        placeholder="hello@domain.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full h-[44px] bg-white border border-black/[0.12] rounded-lg text-[14px] text-black placeholder:text-black/35 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black/20 transition-all duration-200 px-4"
                        required
                      />
                    </div>

                    {/* Password */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <label htmlFor="password" className="text-[13px] font-semibold text-black">
                          Password
                        </label>
                        {mode === "signin" && (
                          <button
                            type="button"
                            className="text-[13px] text-black/50 hover:text-black transition-colors duration-200"
                          >
                            Forgot?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          id="password"
                          placeholder="Enter password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full h-[44px] bg-white border border-black/[0.12] rounded-lg text-[14px] text-black placeholder:text-black/35 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black/20 transition-all duration-200 px-4 pr-11"
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
                          initial={{ opacity: 0, height: 0, marginTop: 0 }}
                          animate={{ opacity: 1, height: "auto", marginTop: 0 }}
                          exit={{ opacity: 0, height: 0, marginTop: 0 }}
                          transition={{ duration: 0.25, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          <div className="flex flex-col gap-2">
                            <label htmlFor="confirm-password" className="text-[13px] font-semibold text-black">
                              Confirm Password
                            </label>
                            <div className="relative">
                              <input
                                id="confirm-password"
                                placeholder="Re-enter password"
                                type={showConfirm ? "text" : "password"}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full h-[44px] bg-white border border-black/[0.12] rounded-lg text-[14px] text-black placeholder:text-black/35 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black/20 transition-all duration-200 px-4 pr-11"
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
                    <AnimatePresence initial={false}>
                      {mode === "signin" && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          <div className="flex items-center gap-2.5 pt-1">
                            <Checkbox
                              id="keep-me-logged-in"
                              checked={rememberMe}
                              onCheckedChange={(checked) => setRememberMe(checked === true)}
                              className="border-black/20 data-[state=checked]:bg-black data-[state=checked]:border-black data-[state=checked]:text-white h-4 w-4 rounded-[4px]"
                            />
                            <label htmlFor="keep-me-logged-in" className="cursor-pointer text-black/60 text-[13px] font-medium">
                              Remember me
                            </label>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* CTA */}
                    <RichButton
                      type="submit"
                      disabled={loading}
                      color="default"
                      size="lg"
                      className="w-full mt-2 h-11 rounded-lg"
                    >
                      {loading
                        ? mode === "signin" ? "Authenticating..." : "Creating..."
                        : mode === "signin" ? "Continue" : "Create Account"}
                    </RichButton>
                  </form>

                  {/* Divider — Or you can sign in with */}
                  {mode === "signin" && (
                    <div className="mt-6">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-black/[0.08]" />
                        <span className="text-[12px] text-black/40 whitespace-nowrap">Or you can sign in with</span>
                        <div className="flex-1 h-px bg-black/[0.08]" />
                      </div>

                      {/* Google button */}
                      <button
                        type="button"
                        onClick={async () => {
                          const { error } = await supabase.auth.signInWithOAuth({
                            provider: "google",
                            options: { redirectTo: window.location.origin + "/" },
                          });
                          if (error) toast.error(error.message);
                        }}
                        className="mt-4 w-full h-11 flex items-center justify-center gap-2.5 bg-white border border-black/[0.12] rounded-lg text-[14px] font-medium text-black hover:bg-black/[0.02] transition-colors duration-200"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        Google
                      </button>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="mt-8 text-center">
                  <p className="text-[13px] text-black/45">
                    {mode === "signin" ? (
                      <>
                        Don't have an account yet?{" "}
                        <span className="text-black/30 mx-0.5">-</span>{" "}
                        <button type="button" onClick={() => switchMode("signup")} className="text-black font-semibold underline hover:text-black/70 transition-colors duration-200">
                          Create account
                        </button>
                      </>
                    ) : (
                      <>
                        Already have an account?{" "}
                        <span className="text-black/30 mx-0.5">-</span>{" "}
                        <button type="button" onClick={() => switchMode("signin")} className="text-black font-semibold underline hover:text-black/70 transition-colors duration-200">
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
