import { useEffect, useRef, useState } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ClientAccount } from "./ClientAccount";
import { ClientSignUp } from "./ClientSignUp";
import { SiteNav } from "@/components/SiteNav";
import {
  OAUTH_ERRORS,
  apiUrl,
  googleStartUrl,
  siteUrl,
  useClientSession,
  useIdentityCacheReset,
} from "@/hooks/use-client-auth";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "") + "/client";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="site-shell min-h-[100dvh] bg-[hsl(var(--background))]">
      <SiteNav />
      <main className="container-rikki flex justify-center py-12 md:py-20">{children}</main>
    </div>
  );
}

function SignInCard() {
  const session = useClientSession();
  const [starting, setStarting] = useState(false);
  const code = new URLSearchParams(window.location.search).get("error");
  const oauthError = code && Object.prototype.hasOwnProperty.call(OAUTH_ERRORS, code) ? OAUTH_ERRORS[code] : code ? OAUTH_ERRORS.google_failed : null;

  if (session.user) return <Redirect to="/account" replace />;

  const unconfigured = !session.isLoading && !session.isError && !session.configured;
  const disabled = session.isLoading || session.isError || unconfigured || starting;

  return (
    <div className="w-full max-w-[440px] rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-8 py-10 shadow-sm">
      <div className="text-center">
        <img className="mx-auto mb-6 h-28 w-28 object-contain" src={siteUrl("/brand/rikki-logo-official.svg")} alt="Rikki Wigs" />
        <h1 className="font-editorial text-3xl">Sign in to Rikki Wigs</h1>
        <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
          Use the Google account with the same email you gave us. Your existing appointments and receipts appear automatically, and new clients get an account on first sign-in.
        </p>
      </div>

      <div className="mt-8 space-y-4">
        {oauthError && (
          <p role="alert" data-testid="text-auth-error" className="rounded-xl border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.05)] p-3 text-sm text-[hsl(var(--destructive))]">
            {oauthError}
          </p>
        )}
        {session.isError && (
          <div role="alert" className="rounded-xl border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.05)] p-3 text-sm text-[hsl(var(--destructive))]">
            We could not check your sign-in status.{" "}
            <button type="button" className="underline" data-testid="button-retry-session" onClick={() => void session.refetch()}>Try again</button>
          </div>
        )}
        {unconfigured && (
          <p role="status" data-testid="text-auth-unavailable" className="rounded-xl border border-[hsl(var(--border))] p-3 text-sm text-[hsl(var(--muted-foreground))]">
            Google sign-in is currently unavailable. Please try again later or contact the studio.
          </p>
        )}
        {session.isLoading ? (
          <div className="skeleton h-12 w-full rounded-full" role="status" aria-label="Checking sign-in status" />
        ) : (
          <button
            type="button"
            disabled={disabled}
            data-testid="button-google-sign-in"
            onClick={() => {
              setStarting(true);
              window.location.assign(googleStartUrl());
            }}
            className="w-full rounded-full bg-[hsl(var(--primary))] px-5 py-3 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"
          >
            {starting ? "Opening Google..." : "Continue with Google"}
          </button>
        )}
        <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">
          Read our <a href={siteUrl("/privacy")} className="underline underline-offset-4">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}

function SignInPage() {
  return <Shell><SignInCard /></Shell>;
}

function SignUpPage() {
  return <ClientSignUp />;
}

function HomeRedirect() {
  const { user, isLoading } = useClientSession();
  if (isLoading) return <Loading text="Loading..." />;
  return <Redirect to={user ? "/account" : "/sign-in"} replace />;
}

function Loading({ text }: { text: string }) {
  return <div role="status" className="container-rikki py-16 text-center text-sm">{text}</div>;
}

function ClientAccountPage() {
  const { user, isLoading, isError, refetch } = useClientSession();
  const admin = Boolean(user?.isAdmin);

  useEffect(() => {
    if (admin) window.location.replace(siteUrl("/manage"));
  }, [admin]);

  if (isLoading) return <Loading text="Checking your account..." />;
  if (isError) {
    return (
      <div role="alert" className="container-rikki py-16 text-center text-sm">
        Unable to check your account.{" "}
        <button type="button" className="underline" onClick={() => void refetch()}>Try again</button>
      </div>
    );
  }
  if (!user) return <Redirect to="/sign-in" replace />;
  if (admin) return <Loading text="Opening the studio..." />;
  return (
    <div className="site-shell min-h-[100dvh] bg-[hsl(var(--background))]">
      <SiteNav isClientAccount />
      <ClientAccount />
    </div>
  );
}

function ClientSignOut() {
  const queryClient = useQueryClient();
  const started = useRef(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    setError(false);
    fetch(apiUrl("/auth/logout"), { method: "POST", credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) throw new Error("logout failed");
        queryClient.clear();
        window.location.replace(siteUrl("/"));
      })
      .catch(() => {
        started.current = false;
        setError(true);
      });
  }, [attempt, queryClient]);

  return (
    <div className="container-rikki py-16 text-center" role="status">
      {error ? (
        <div role="alert">
          <p>We could not sign you out. Check your connection and try again.</p>
          <button type="button" className="mt-3 underline" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </div>
      ) : "Signing out..."}
    </div>
  );
}

function ClientRoutes() {
  useIdentityCacheReset();
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/account" component={ClientAccountPage} />
      <Route path="/sign-out" component={ClientSignOut} />
    </Switch>
  );
}

export function ClientApp() {
  return <WouterRouter base={basePath}><ClientRoutes /></WouterRouter>;
}
