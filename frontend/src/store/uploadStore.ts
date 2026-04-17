import { create } from "zustand";
import type { ColumnMapping, UploadResponse } from "@/lib/types";

interface UploadState {
  sessionId: string | null;
  uploadResponse: UploadResponse | null;
  columnMapping: Partial<ColumnMapping>;
  setUploadResponse: (response: UploadResponse) => void;
  setColumnMapping: (mapping: Partial<ColumnMapping>) => void;
  reset: () => void;
}

export const useUploadStore = create<UploadState>((set) => ({
  sessionId: null,
  uploadResponse: null,
  columnMapping: {},

  setUploadResponse: (response) =>
    set({ uploadResponse: response, sessionId: response.session_id }),

  setColumnMapping: (mapping) =>
    set((state) => ({
      columnMapping: { ...state.columnMapping, ...mapping },
    })),

  reset: () =>
    set({ sessionId: null, uploadResponse: null, columnMapping: {} }),
}));
