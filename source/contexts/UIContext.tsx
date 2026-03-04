import { createContext, useContext } from 'react';
import type { View, Overlay } from '../types.js';

export interface UIContextType {
  view: View;
  setView: (view: View) => void;
  overlay: Overlay;
  setOverlay: (overlay: Overlay) => void;
  isTyping: boolean;
  setIsTyping: (isTyping: boolean) => void;
}

export const UIContext = createContext<UIContextType | null>(null);

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return ctx;
}
