import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

/**
 * Owns the Mingo chat drawer's open state (lifted out of `AppShell` so any page
 * can open it) plus a one-shot `pendingPrompt` that the chat embedder consumes
 * on open to auto-send into a fresh Mingo dialog.
 *
 * `sendToMingo(prompt)` is the single launcher entry point (e.g. the onboarding
 * "Meet Mingo" quick-action chips): it opens the drawer and queues the prompt;
 * the embedder (`OpenframeEmbeddableChatEntry`) drains it via `sendInNewDialog`
 * and clears it with `consumePendingPrompt()`.
 */
interface MingoLauncherStore {
  isOpen: boolean;
  /** One-shot prompt to auto-send on the next drawer open; null once consumed. */
  pendingPrompt: string | null;

  setOpen: (open: boolean) => void;
  toggle: () => void;
  close: () => void;
  /** Open the drawer and queue a prompt for Mingo auto-send — the chat entry
   *  drains it straight into a fresh Mingo dialog via `sendInNewDialog`. */
  sendToMingo: (prompt: string) => void;
  /** Read and clear the pending prompt in one step (safe against double-consume). */
  consumePendingPrompt: () => string | null;
}

export const useMingoLauncherStore = create<MingoLauncherStore>()(
  devtools(
    (set, get) => ({
      isOpen: false,
      pendingPrompt: null,

      setOpen: open => set({ isOpen: open }, false, 'setOpen'),
      toggle: () => set(state => ({ isOpen: !state.isOpen }), false, 'toggle'),
      close: () => set({ isOpen: false }, false, 'close'),

      sendToMingo: prompt => set({ isOpen: true, pendingPrompt: prompt }, false, 'sendToMingo'),

      consumePendingPrompt: () => {
        const { pendingPrompt } = get();
        if (pendingPrompt !== null) set({ pendingPrompt: null }, false, 'consumePendingPrompt');
        return pendingPrompt;
      },
    }),
    { name: 'mingo-launcher-store' },
  ),
);
