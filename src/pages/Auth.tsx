import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TextureButton } from "@/components/ui/texture-button";
import {
  TextureCardContent,
  TextureCardFooter,
  TextureCardHeader,
  TextureCardStyled,
  TextureCardTitle,
  TextureSeparator,
} from "@/components/ui/texture-card";
import { toast } from "sonner";
import { ArrowRight, Eye, EyeOff, MailCheck, Merge, ShieldCheck } from "lucide-react";
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
        <div className="absolute right-0 top-[15%] bottom-[15%] w-px bg-gradient-to-b from-transparent via-black/[0.06] to-transparent" />
      </div>

      {/* Right panel — texture card auth form */}
      <div className="flex-1 flex items-center justify-center relative">
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
              >
                <TextureCardStyled>
                  <TextureCardHeader className="flex flex-col gap-1 items-center justify-center p-6">
                    <div className="p-3 bg-neutral-950 rounded-full mb-3">
                      <Merge className="h-7 w-7 stroke-neutral-200" />
                    </div>
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={mode}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="text-center"
                      >
                        <TextureCardTitle>
                          {mode === "signin" ? "Welcome back" : "Create your account"}
                        </TextureCardTitle>
                        <p className="text-sm text-neutral-500 mt-1">
                          {mode === "signin"
                            ? "Sign in to continue to your workspace."
                            : "Welcome! Please fill in the details to get started."}
                        </p>
                      </motion.div>
                    </AnimatePresence>
                  </TextureCardHeader>

                  <TextureSeparator />

                  <TextureCardContent className="pt-6">
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                      <div>
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="name@company.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          className="w-full px-4 py-2 rounded-md border border-neutral-300 bg-white/80 placeholder-neutral-400"
                        />
                      </div>

                      <div>
                        <Label htmlFor="password">Password</Label>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full px-4 py-2 pr-10 rounded-md border border-neutral-300 bg-white/80 placeholder-neutral-400"
                          />
                          <button
                            className="text-neutral-400 hover:text-neutral-600 absolute top-1/2 -translate-y-1/2 right-3 transition-colors"
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>

                      <AnimatePresence initial={false}>
                        {mode === "signup" && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            className="overflow-hidden"
                          >
                            <div>
                              <Label htmlFor="confirm-password">Confirm Password</Label>
                              <div className="relative">
                                <Input
                                  id="confirm-password"
                                  type={showConfirm ? "text" : "password"}
                                  placeholder="Re-enter password"
                                  value={confirmPassword}
                                  onChange={(e) => setConfirmPassword(e.target.value)}
                                  required={mode === "signup"}
                                  className="w-full px-4 py-2 pr-10 rounded-md border border-neutral-300 bg-white/80 placeholder-neutral-400"
                                />
                                <button
                                  className="text-neutral-400 hover:text-neutral-600 absolute top-1/2 -translate-y-1/2 right-3 transition-colors"
                                  type="button"
                                  onClick={() => setShowConfirm(!showConfirm)}
                                >
                                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {mode === "signin" && (
                        <div className="flex items-center gap-2.5">
                          <Checkbox
                            id="keep-me-logged-in"
                            checked={rememberMe}
                            onCheckedChange={(checked) => setRememberMe(checked === true)}
                            className="border-neutral-300 data-[state=checked]:bg-black data-[state=checked]:border-black data-[state=checked]:text-white h-4 w-4 rounded"
                          />
                          <label htmlFor="keep-me-logged-in" className="cursor-pointer text-sm text-neutral-500">
                            Remember me
                          </label>
                        </div>
                      )}
                    </form>
                  </TextureCardContent>

                  <TextureSeparator />

                  <TextureCardFooter className="border-b rounded-b-sm pt-4">
                    <TextureButton
                      variant="accent"
                      className="w-full"
                      onClick={handleSubmit as unknown as React.MouseEventHandler}
                      disabled={loading}
                    >
                      <div className="flex gap-1 items-center justify-center">
                        {loading
                          ? mode === "signin" ? "Authenticating..." : "Creating..."
                          : mode === "signin" ? "Continue" : "Create Account"}
                        {!loading && <ArrowRight className="h-4 w-4 text-neutral-50 mt-[1px]" />}
                      </div>
                    </TextureButton>
                  </TextureCardFooter>

                  <div className="bg-stone-100 pt-px rounded-b-[20px] overflow-hidden">
                    <div className="flex flex-col items-center justify-center">
                      <div className="py-3 px-2">
                        <div className="text-center text-sm text-neutral-600">
                          {mode === "signin" ? (
                            <>
                              Don't have an account?{" "}
                              <button
                                type="button"
                                onClick={() => switchMode("signup")}
                                className="text-black font-semibold hover:underline"
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
                                className="text-black font-semibold hover:underline"
                              >
                                Sign in
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <TextureSeparator />
                    <div className="flex flex-col items-center justify-center">
                      <div className="py-2 px-2">
                        <div className="text-center text-xs text-neutral-400">
                          Secured by Supabase
                        </div>
                      </div>
                    </div>
                  </div>
                </TextureCardStyled>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
