import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetAuthSession, getGetAuthSessionQueryKey } from "@workspace/api-client-react";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export const siteUrl = (path: string) => `${base}${path}`;
export const apiUrl = (path: string) => `${base}/api${path}`;
export const googleStartUrl = () => apiUrl("/auth/google/start");

export const OAUTH_ERRORS: Record<string, string> = {
  cancelled: "Google sign-in was cancelled. You can try again whenever you are ready.",
  expired: "That sign-in attempt expired. Please start again.",
  google_failed: "Google could not complete the sign-in. Please try again.",
  unverified_email: "That Google account's email address is not verified. Please use a verified Google email.",
  unavailable: "Google sign-in is temporarily unavailable. Please try again shortly.",
  session_failed: "We could not start your session. Please try again.",
};

export function useClientSession() {
  const query = useGetAuthSession({ query: { queryKey: getGetAuthSessionQueryKey(), staleTime: 15_000, retry: 1 } });
  const user = query.data?.user ?? null;
  return {
    user,
    configured: query.data?.configured ?? false,
    isLoading: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/** Clears user-scoped caches (everything except the session itself) when identity changes. */
export function useIdentityCacheReset() {
  const queryClient = useQueryClient();
  const { user, isLoading } = useClientSession();
  const prev = useRef<string | null | undefined>(undefined);
  const id = user?.id ?? null;
  useEffect(() => {
    if (isLoading) return;
    if (prev.current !== undefined && prev.current !== id) {
      const sessionKey = getGetAuthSessionQueryKey()[0];
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== sessionKey });
    }
    prev.current = id;
  }, [id, isLoading, queryClient]);
}
