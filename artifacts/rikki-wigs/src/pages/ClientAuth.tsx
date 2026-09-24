import { useEffect, useRef, useState } from "react";
import { ClerkProvider, SignIn, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ClientAccount } from "./ClientAccount";
import { ClientSignUp } from "./ClientSignUp";
import { SiteNav } from "@/components/SiteNav";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// Replit injects this value into published builds and leaves it empty in dev.
// Keep the canonical env-backed proxyUrl; hardcoding /api/__clerk breaks managed Clerk.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "") + "/client";

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/brand/rikki-logo-official.svg`,
  },
  variables: {
    colorPrimary: "hsl(20 10% 8%)",
    colorForeground: "hsl(20 10% 8%)",
    colorMutedForeground: "hsl(25 8% 35%)",
    colorDanger: "hsl(3 57% 42%)",
    colorBackground: "hsl(35 40% 98%)",
    colorInput: "hsl(35 40% 98%)",
    colorInputForeground: "hsl(20 10% 8%)",
    colorNeutral: "hsl(31 19% 78%)",
    fontFamily: "var(--app-font-sans)",
    borderRadius: "0.65rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[hsl(35_40%_98%)] border border-[hsl(36_13%_82%)] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-sm",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "font-editorial text-3xl",
    headerSubtitle: "text-[hsl(25_8%_35%)] text-sm",
    socialButtonsBlockButtonText: "font-semibold text-sm",
    formFieldLabel: "text-[hsl(20_10%_8%)] text-xs font-semibold mb-1.5",
    footerActionLink: "text-[hsl(32_42%_49%)] font-semibold hover:text-[hsl(20_10%_8%)]",
    footerActionText: "text-[hsl(25_8%_35%)]",
    dividerText: "text-[hsl(25_8%_35%)] font-mono-ui uppercase text-[10px] tracking-wider",
    identityPreviewEditButton: "text-[hsl(32_42%_49%)]",
    formFieldSuccessText: "text-[hsl(150_35%_28%)]",
    alertText: "text-[hsl(3_57%_42%)]",
    logoBox: "mx-auto h-32 w-32 mb-4",
    logoImage: "w-full h-full object-contain",
    socialButtonsBlockButton: "border border-[hsl(31_19%_78%)] rounded-xl py-3 hover:bg-[hsl(31_28%_87%)]",
    formButtonPrimary: "bg-[hsl(20_10%_8%)] text-white hover:bg-black rounded-full py-3 font-semibold transition-transform hover:-translate-y-0.5",
    formFieldInput: "border border-[hsl(31_19%_78%)] bg-[hsl(35_40%_98%)] rounded-lg py-2.5 px-3 focus:border-[hsl(32_42%_49%)] focus:ring focus:ring-[hsl(32_42%_49%)/.2]",
    footerAction: "",
    dividerLine: "bg-[hsl(31_19%_78%)]",
    alert: "border border-[hsl(3_57%_42%)] bg-[hsl(3_57%_42%)/.05] rounded-xl p-3",
    otpCodeFieldInput: "border border-[hsl(31_19%_78%)] bg-[hsl(35_40%_98%)] rounded-lg",
    formFieldRow: "mb-4",
    main: "p-8",
  },
};

function SignInPage() {
  return (
    <div className="site-shell min-h-[100dvh] bg-[hsl(var(--background))]">
      <SiteNav />
      <main className="container-rikki flex justify-center py-12 md:py-20">
        <SignIn
          routing="path"
          path={`${basePath}/sign-in`}
          signUpUrl={`${basePath}/sign-up`}
          fallbackRedirectUrl={`${basePath}/account`}
          appearance={{ elements: { logoBox: "translate-y-8" } }}
        />
      </main>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="site-shell min-h-[100dvh] bg-[hsl(var(--background))]">
      <SiteNav />
      <main className="container-rikki flex justify-center py-12 md:py-20">
        <ClientSignUp />
      </main>
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/account" />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function ClientAccountPage() {
  return (
    <>
      <Show when="signed-in">
        <AccountDestination />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function AccountDestination() {
  const [destination, setDestination] = useState<"checking" | "client" | "error">("checking");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin-session", { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (response.ok) {
          window.location.replace("/manage");
        } else {
          setDestination(response.status === 403 ? "client" : "error");
        }
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setDestination("error");
      });
    return () => controller.abort();
  }, []);

  if (destination === "checking") return <div role="status" className="container-rikki py-16 text-center">Checking your account…</div>;
  if (destination === "error") return <div role="alert" className="container-rikki py-16 text-center">Unable to check your account. Please reload and try again.</div>;
  return (
    <div className="site-shell min-h-[100dvh] bg-[hsl(var(--background))]">
      <SiteNav isClientAccount />
      <ClientAccount />
    </div>
  );
}

function ClientSignOut() {
  const { signOut } = useClerk();
  const started = useRef(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void signOut({ redirectUrl: "/" }).catch(() => setError(true));
  }, [signOut]);

  return <div className="container-rikki py-16 text-center" role="status">{error ? <p>Could not sign out. Please reload and try again.</p> : "Signing out…"}</div>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener((emission: any) => {
      const userId = emission.user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function ClientRoutes() {
  const [, setLocation] = useLocation();
  return (
      <ClerkProvider
        publishableKey={clerkPubKey}
        proxyUrl={clerkProxyUrl}
        appearance={clerkAppearance}
        signInUrl={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        localization={{
          signIn: {
            start: {
              title: "",
              subtitle: "",
            },
          },
          signUp: {
            start: {
              title: "Create Client Account",
              subtitle: "Register to manage your Rikki Wigs history",
            },
          },
        }}
        routerPush={(to: string) => setLocation(stripBase(to))}
        routerReplace={(to: string) => setLocation(stripBase(to), { replace: true })}
      >
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/account" component={ClientAccountPage} />
          <Route path="/sign-out" component={ClientSignOut} />
        </Switch>
      </ClerkProvider>
  );
}

export function ClientApp() {
  return <WouterRouter base={basePath}><ClientRoutes /></WouterRouter>;
}