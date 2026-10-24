import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";
import type { Perm, UserOut } from "./types";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => apiGet<UserOut>("/auth/me"), retry: false, staleTime: 60_000 });
}

export function useCan() {
  const { data } = useMe();
  return (p: Perm) => !!data?.permissions.includes(p);
}
