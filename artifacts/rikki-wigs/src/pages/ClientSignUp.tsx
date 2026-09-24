import { useState, type FormEvent } from "react";
import { useAuth, useClerk } from "@clerk/react";
import { Link, useLocation } from "wouter";

type Step = "email" | "verify" | "password";

function messageFor(error: unknown): string {
  if (typeof error === "object" && error && "errors" in error) {
    const entries = (error as { errors?: Array<{ longMessage?: string; message?: string }> }).errors;
    if (entries?.[0]) return entries[0].longMessage || entries[0].message || "Please try again.";
  }
  return error instanceof Error ? error.message : "Please try again.";
}

export function ClientSignUp() {
  const { isLoaded } = useAuth();
  const { client, setActive } = useClerk();
  const signUp = client?.signUp;
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded || !signUp) return;
    setBusy(true);
    setError("");
    try {
      if (step === "email") {
        const value = email.trim().toLowerCase();
        await signUp.create({ emailAddress: value });
        await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
        setEmail(value);
        setStep("verify");
      } else if (step === "verify") {
        const result = await signUp.attemptEmailAddressVerification({ code: code.trim() });
        if (result.verifications.emailAddress.status !== "verified") {
          throw new Error("The code could not be verified. Please try again.");
        }
        setStep("password");
      } else {
        const result = await signUp.update({ password });
        if (result.status !== "complete" || !result.createdSessionId) {
          throw new Error("Account setup is not complete. Please check your details and try again.");
        }
        await setActive({ session: result.createdSessionId });
        navigate("/account");
      }
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (!isLoaded || !signUp) return;
    setBusy(true);
    setError("");
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  const label = step === "email" ? "Email address" : step === "verify" ? "Verification code" : "Create a password";
  const title = step === "email" ? "Create client account" : step === "verify" ? "Verify your email" : "Set your password";
  const description = step === "email"
    ? "We'll send a code to confirm this address belongs to you."
    : step === "verify" ? `Enter the code sent to ${email}.` : "Your email is verified. Choose a password to finish setting up your account.";

  return (
    <div className="w-full max-w-[440px] rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-8 py-10 shadow-sm">
      <div className="text-center">
        <img className="mx-auto mb-8 h-16 w-16" src="/brand/rikki-logo-official.svg" alt="Rikki Wigs" />
        <h1 className="font-editorial text-3xl">{title}</h1>
        <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">{description}</p>
      </div>
      <form onSubmit={(event) => void submit(event)} className="mt-10 space-y-5">
        {/* Clerk's bot protection mounts its challenge in this element. */}
        <div id="clerk-captcha" />
        <label className="block text-sm font-semibold">
          {label}
          <input
            className="mt-2 w-full rounded-lg border border-[hsl(var(--border))] bg-transparent px-3 py-2.5 outline-none focus:border-[hsl(var(--primary))]"
            type={step === "email" ? "email" : step === "password" ? "password" : "text"}
            autoComplete={step === "email" ? "email" : step === "password" ? "new-password" : "one-time-code"}
            required
            minLength={step === "password" ? 8 : undefined}
            value={step === "email" ? email : step === "verify" ? code : password}
            onChange={(event) => (step === "email" ? setEmail : step === "verify" ? setCode : setPassword)(event.target.value)}
          />
        </label>
        {error && <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{error}</p>}
        <button disabled={busy || !isLoaded} type="submit" className="w-full rounded-full bg-[hsl(var(--primary))] px-5 py-3 text-sm font-semibold text-[hsl(var(--primary-foreground))] disabled:opacity-50">
          {busy ? "Please wait..." : step === "email" ? "Send verification code" : step === "verify" ? "Verify email" : "Create account"}
        </button>
      </form>
      {step === "verify" && <button type="button" disabled={busy} onClick={() => void resendCode()} className="mt-5 w-full text-center text-sm underline disabled:opacity-50">Send a new code</button>}
      <p className="mt-10 text-center text-sm text-[hsl(var(--muted-foreground))]">
        Already have an account? <Link href="/sign-in" className="font-semibold text-[hsl(var(--primary))] underline">Sign in</Link>
      </p>
    </div>
  );
}