import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "./api";
import type { ComponentView, Equipment, Family, Manufacturer } from "./types";

export const useFamilies = () => useQuery({ queryKey: ["families"], queryFn: () => apiGet<Family[]>("/families") });
export const useManufacturers = () =>
  useQuery({ queryKey: ["manufacturers"], queryFn: () => apiGet<Manufacturer[]>("/manufacturers") });
export const useEquipment = () => useQuery({ queryKey: ["equipment", ""], queryFn: () => apiGet<Equipment[]>("/equipment") });
export const useComponents = (query = "") =>
  useQuery({ queryKey: ["components", query], queryFn: () => apiGet<ComponentView[]>(`/components${query}`) });

/** Every write can ripple through lives, LCC, dashboard and reports — refresh all cached reads. */
export function useRefreshAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "me" });
}
