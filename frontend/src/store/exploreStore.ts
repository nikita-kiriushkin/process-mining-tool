import { create } from "zustand";
import type { ProcessFilters, ProcessResponse, SelectedElement } from "@/lib/types";

interface ExploreState {
  processData: ProcessResponse | null;
  filters: ProcessFilters;
  selectedElement: SelectedElement;
  setProcessData: (data: ProcessResponse) => void;
  setFilters: (filters: Partial<ProcessFilters>) => void;
  setSelectedElement: (element: SelectedElement) => void;
  resetFilters: () => void;
}

const defaultFilters: ProcessFilters = {};

export const useExploreStore = create<ExploreState>((set) => ({
  processData: null,
  filters: defaultFilters,
  selectedElement: null,

  setProcessData: (data) => set({ processData: data }),

  setFilters: (filters) =>
    set((state) => ({ filters: { ...state.filters, ...filters } })),

  setSelectedElement: (element) => set({ selectedElement: element }),

  resetFilters: () => set({ filters: defaultFilters }),
}));
