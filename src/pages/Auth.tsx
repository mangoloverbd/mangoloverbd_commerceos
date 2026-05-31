import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Eye, EyeOff, ShieldCheck, MailCheck } from "lucide-react";
import { RiUserFill } from "@remixicon/react";
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
    <div className="min-h-screen w-full relative flex items-center justify-center overflow-hidden bg-[#0a0a0a]">
      {/* Sparkles background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.03),transparent_50%)]" />
        <Sparkles
          density={400}
          size={0.8}
          speed={0.3}
          opacity={0.4}
          className="absolute inset-0 h-full w-full"
          color="#ffffff"
        />
      </div>

      <div className="relative z-10 mx-4">
        <AnimatePresence mode="wait">
          {emailSent ? (
            <motion.div
              key="email-sent"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <Card className="flex w-full max-w-[460px] flex-col gap-6 p-8 md:p-10 bg-[#111111] border-[#222] shadow-2xl shadow-black/50">
                <div className="w-full flex flex-col items-center text-center space-y-6">
                  <div className="h-16 w-16 rounded-2xl flex items-center justify-center bg-white/[0.04] border border-white/[0.08]">
                    <MailCheck className="w-7 h-7 text-white/80" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white">Check your email</h2>
                    <p className="text-sm text-white/50 font-light leading-relaxed">
                      We sent a confirmation link to<br />
                      <span className="font-medium text-white">{email}</span>
                    </p>
                  </div>
                  <div className="w-full rounded-xl p-4 text-left space-y-1 bg-white/[0.03] border border-white/[0.06]">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/30">Next steps</p>
                    <p className="text-xs text-white/50 leading-relaxed">
                      Open the email and click <span className="font-medium text-white/80">Confirm your mail</span>. You'll be signed in automatically.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => switchMode("signin")}
                    className="text-[9px] font-semibold uppercase tracking-[0.25em] text-white/30 hover:text-white/60 transition-colors"
                  >
                    Back to sign in
                  </button>
                </div>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 32, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            >
              <Card className="flex w-full max-w-[460px] flex-col gap-5 p-8 md:p-10 bg-[#111111] border-[#222] shadow-2xl shadow-black/50">
                <CardHeader className="flex flex-col items-center gap-3 p-0">
                  <div className="flex flex-col space-y-1 text-center">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={mode}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.3 }}
                      >
                        <CardTitle className="text-[22px] font-semibold tracking-[-0.03em] text-white">
                          {mode === "signin" ? "Welcome back" : "Create account"}
                        </CardTitle>
                        <CardDescription className="text-[13px] text-white/40 mt-1 tracking-[-0.01em]">
                          {mode === "signin"
                            ? "Enter your credentials to continue."
                            : "Sign up to get started."}
                        </CardDescription>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </CardHeader>

                <Separator className="bg-white/[0.06]" />

                <CardContent className="p-0">
                  {/* Mode tabs */}
                  <div className="mb-5 grid w-full grid-cols-2 gap-1 rounded-lg bg-white/[0.03] p-1">
                    {(["signin", "signup"] as Mode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => switchMode(m)}
                        className={`h-8 rounded-md text-[11px] font-medium tracking-wide transition-all ${
                          mode === m
                            ? "bg-white/[0.08] text-white shadow-sm"
                            : "text-white/35 hover:text-white/60"
                        }`}
                      >
                        {m === "signin" ? "Sign In" : "Sign Up"}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="email" className="text-[11px] font-medium text-white/50 uppercase tracking-[0.1em]">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="name@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-11 rounded-lg bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/25 focus-visible:ring-1 focus-visible:ring-white/20 focus-visible:border-white/20"
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="password" className="text-[11px] font-medium text-white/50 uppercase tracking-[0.1em]">Password</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          className="h-11 pe-9 rounded-lg bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/25 focus-visible:ring-1 focus-visible:ring-white/20 focus-visible:border-white/20"
                          placeholder="Enter password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                        />
                        <button
                          className="text-white/25 hover:text-white/50 absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md transition-colors"
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
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
                          transition={{ duration: 0.3 }}
                          className="overflow-hidden"
                        >
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="confirm-password" className="text-[11px] font-medium text-white/50 uppercase tracking-[0.1em]">Confirm Password</Label>
                            <div className="relative">
                              <Input
                                id="confirm-password"
                                className="h-11 pe-9 rounded-lg bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/25 focus-visible:ring-1 focus-visible:ring-white/20 focus-visible:border-white/20"
                                placeholder="Confirm password"
                                type={showConfirm ? "text" : "password"}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required={mode === "signup"}
                              />
                              <button
                                className="text-white/25 hover:text-white/50 absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md transition-colors"
                                type="button"
                                onClick={() => setShowConfirm(!showConfirm)}
                              >
                                {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Remember me — signin only */}
                    {mode === "signin" && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="keep-me-logged-in"
                          checked={rememberMe}
                          onCheckedChange={(checked) => setRememberMe(checked === true)}
                          className="border-white/20 data-[state=checked]:bg-white data-[state=checked]:text-black h-3.5 w-3.5"
                        />
                        <Label htmlFor="keep-me-logged-in" className="cursor-pointer text-white/40 text-[12px]">
                          Keep me logged in
                        </Label>
                      </div>
                    )}

                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full h-11 bg-white text-[#0a0a0a] hover:bg-white/90 font-semibold text-[13px] tracking-[-0.01em] rounded-lg mt-1"
                    >
                      {loading
                        ? mode === "signin" ? "Signing In..." : "Creating..."
                        : mode === "signin" ? "Continue" : "Create Account"}
                    </Button>
                  </form>

                  {/* Footer links */}
                  <div className="mt-5 text-center">
                    <p className="text-[12px] text-white/30">
                      {mode === "signin" ? (
                        <>
                          Don&apos;t have an account?{" "}
                          <button type="button" onClick={() => switchMode("signup")} className="font-medium text-white/60 hover:text-white underline underline-offset-2 transition-colors">
                            Sign up
                          </button>
                        </>
                      ) : (
                        <>
                          Already have an account?{" "}
                          <button type="button" onClick={() => switchMode("signin")} className="font-medium text-white/60 hover:text-white underline underline-offset-2 transition-colors">
                            Sign in
                          </button>
                        </>
                      )}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
