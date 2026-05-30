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
    <div className="min-h-screen w-full relative flex items-center justify-center overflow-hidden bg-black">
      {/* Sparkles background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_bottom_center,#8350e8,transparent_70%)] before:opacity-40" />
        <div className="absolute -left-1/2 top-1/2 aspect-[1/0.7] z-10 w-[200%] rounded-[100%] border-t border-white/20 bg-black" />
        <Sparkles
          density={1200}
          className="absolute inset-0 h-full w-full [mask-image:radial-gradient(50%_50%,white,transparent_85%)]"
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
              <Card className="flex w-full max-w-[480px] shadow-none flex-col gap-6 p-6 md:p-10 bg-white/[0.03] backdrop-blur-xl border-white/10">
                <div className="w-full flex flex-col items-center text-center space-y-6">
                  <div className="h-16 w-16 rounded-2xl flex items-center justify-center bg-white/[0.06] border border-white/10">
                    <MailCheck className="w-7 h-7 text-white" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold tracking-tight text-white">Check your email</h2>
                    <p className="text-sm text-white/70 font-light leading-relaxed">
                      We sent a confirmation link to<br />
                      <span className="font-semibold text-white">{email}</span>
                    </p>
                  </div>
                  <div className="w-full rounded-xl p-4 text-left space-y-1 bg-white/[0.06] border border-white/10">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Next steps</p>
                    <p className="text-xs text-white/50 leading-relaxed">
                      Open the email and click <span className="font-semibold text-white">Confirm your mail</span>. You'll be signed in automatically and redirected to set up your workspace.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => switchMode("signin")}
                    className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 hover:text-white transition-colors"
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
              <Card className="flex w-full max-w-[480px] shadow-none flex-col gap-6 p-6 md:p-10 bg-white/[0.03] backdrop-blur-xl border-white/10">
                <CardHeader className="flex flex-col items-center gap-2 p-0">
                  {/* Avatar circle */}
                  <div className="relative flex size-[68px] shrink-0 items-center justify-center rounded-full backdrop-blur-xl md:size-24 before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-b before:from-neutral-500 before:to-transparent before:opacity-10">
                    <div className="relative z-10 flex size-12 items-center justify-center rounded-full bg-white/10 shadow-xs ring-1 ring-inset ring-white/20 md:size-16">
                      <RiUserFill className="size-6 text-white/60 md:size-8" />
                    </div>
                  </div>

                  <div className="flex flex-col space-y-1.5 text-center">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={mode}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.3 }}
                      >
                        <CardTitle className="md:text-xl font-medium text-white">
                          {mode === "signin" ? "Sign in to your account" : "Create your account"}
                        </CardTitle>
                        <CardDescription className="tracking-[-0.006em] text-white/50 mt-1.5">
                          {mode === "signin"
                            ? "Enter your credentials to access your account."
                            : "Sign up to get started with Arc Lab Technology."}
                        </CardDescription>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </CardHeader>

                <Separator className="bg-white/10" />

                <CardContent className="p-0">
                  {/* Mode tabs */}
                  <div className="mb-5 grid w-full grid-cols-2 gap-2">
                    {(["signin", "signup"] as Mode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => switchMode(m)}
                        className={`h-9 rounded-lg text-[11px] font-medium uppercase tracking-widest transition-all ${
                          mode === m
                            ? "bg-white/10 text-white ring-1 ring-white/20"
                            : "text-white/40 hover:text-white/60"
                        }`}
                      >
                        {m === "signin" ? "Sign In" : "Sign Up"}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2.5">
                      <Label htmlFor="email" className="text-white/70">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="Enter your email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="rounded-lg bg-white/[0.06] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-white/30"
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-2.5">
                      <Label htmlFor="password" className="text-white/70">Password</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          className="pe-9 rounded-lg bg-white/[0.06] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-white/30"
                          placeholder="Password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                        />
                        <button
                          className="text-white/40 hover:text-white/70 absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md transition-colors"
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
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
                          <div className="flex flex-col gap-2.5">
                            <Label htmlFor="confirm-password" className="text-white/70">Confirm Password</Label>
                            <div className="relative">
                              <Input
                                id="confirm-password"
                                className="pe-9 rounded-lg bg-white/[0.06] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-white/30"
                                placeholder="Confirm password"
                                type={showConfirm ? "text" : "password"}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required={mode === "signup"}
                              />
                              <button
                                className="text-white/40 hover:text-white/70 absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md transition-colors"
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

                    {/* Remember me — signin only */}
                    {mode === "signin" && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="keep-me-logged-in"
                          checked={rememberMe}
                          onCheckedChange={(checked) => setRememberMe(checked === true)}
                          className="border-white/20 data-[state=checked]:bg-white data-[state=checked]:text-black"
                        />
                        <Label htmlFor="keep-me-logged-in" className="cursor-pointer text-white/60 text-sm">
                          Keep me logged in
                        </Label>
                      </div>
                    )}

                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-black text-white hover:bg-black/90 font-medium"
                    >
                      {loading
                        ? mode === "signin" ? "Signing In..." : "Creating..."
                        : mode === "signin" ? "Continue" : "Create Account"}
                    </Button>
                  </form>

                  {/* Footer links */}
                  <div className="mt-5 text-center">
                    <p className="text-sm text-white/50">
                      {mode === "signin" ? (
                        <>
                          Don&apos;t have an account?{" "}
                          <button type="button" onClick={() => switchMode("signup")} className="font-medium text-white hover:text-white/80 underline underline-offset-2">
                            Sign up
                          </button>
                        </>
                      ) : (
                        <>
                          Already have an account?{" "}
                          <button type="button" onClick={() => switchMode("signin")} className="font-medium text-white hover:text-white/80 underline underline-offset-2">
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
