import { useEffect } from 'react';
import { appPlugin, isNativeShell } from './native-shell';

/**
 * Native hardware/gesture back (Android), wired through @capacitor/app.
 *
 * iOS has no hardware back — it uses the WKWebView left-edge swipe
 * (`allowsBackForwardNavigationGestures`, set natively in MainViewController),
 * which navigates the WebKit history directly and never emits this event. So
 * everything here is effectively Android-only.
 *
 * Back priority (Android convention): close the topmost registered overlay →
 * navigate the SPA history back → exit the app at the history root. Overlays
 * register a close handler while open (`useNativeBackDismissible`) so back
 * dismisses them first rather than navigating away underneath them.
 */

type Dismissible = () => void;

// LIFO: the most-recently-opened overlay is closed first.
const dismissibles: Dismissible[] = [];

/** Register a dismissible's close handler while it's open. Returns an unregister. */
export function pushBackDismissible(close: Dismissible): () => void {
  dismissibles.push(close);
  return () => {
    const i = dismissibles.lastIndexOf(close);
    if (i !== -1) dismissibles.splice(i, 1);
  };
}

let initialized = false;

/** Wire the Android back button once. No-op on web and (effectively) on iOS. */
export function initNativeBack(): void {
  if (initialized || !isNativeShell()) return;
  const app = appPlugin();
  if (!app) return;
  initialized = true;
  try {
    // The natively-injected plugin proxy returns a bare synchronous handle from
    // addListener — NOT the Promise the plugin type suggests. Chaining .catch
    // on it directly threw at boot and killed the shell initializer before the
    // splash could hide (app stuck on splash). Promise.resolve absorbs both
    // shapes; the try/catch covers a synchronously-throwing bridge.
    const registration = app.addListener('backButton', ({ canGoBack }) => {
      const close = dismissibles.pop();
      if (close) {
        try {
          close();
        } catch (error) {
          console.error('[Native Back] dismissible close failed:', error);
        }
        return;
      }
      if (canGoBack ?? window.history.length > 1) {
        window.history.back();
        return;
      }
      void app.exitApp();
    });
    void Promise.resolve(registration).catch(error => {
      // Registration failed — clear the guard so a later call can retry.
      initialized = false;
      console.error('[Native Back] backButton listener registration failed:', error);
    });
  } catch (error) {
    initialized = false;
    console.error('[Native Back] backButton listener registration failed:', error);
  }
}

/**
 * Close `onClose` on hardware back while `isOpen` is true. `onClose` must be
 * stable (wrap in useCallback) or the effect re-registers every render.
 * No-op on web.
 */
export function useNativeBackDismissible(isOpen: boolean, onClose: Dismissible): void {
  useEffect(() => {
    if (!isOpen || !isNativeShell()) return;
    return pushBackDismissible(onClose);
  }, [isOpen, onClose]);
}
