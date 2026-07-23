'use client';

/**
 * `useMingoContextMemory` — feeds `EmbeddableChat`'s `contextMemory` slot
 * (Figma 271:38656): the strip above the composer that summarises what Mingo
 * remembers about where the user has been, with a `⋯` dropdown listing every
 * entity and a per-row × to forget it.
 *
 * Source is the navigation-context store — the SAME `openView` / `recentViews`
 * that ride out on every Mingo message (see `use-mingo-unified-chat-state`), so
 * the strip shows exactly what the agent receives, with no extra fetch. The
 * currently-open entity leads the list (it used to have its own banner under the
 * chat header, Figma 192:51006, now folded in here); the previously-viewed
 * entities follow, most-recent-first.
 *
 * `ContextRefWithLabel` is structurally a `ChatContextItem` (`type` / `id` /
 * `label` / `description`), so the store refs are passed through unmapped.
 */

import type { ChatContextItem } from '@flamingo-stack/openframe-frontend-core/components/chat';
import { useCallback, useMemo } from 'react';
import { useMingoContextStore } from '../stores/mingo-context-store';

export interface MingoContextMemory {
  items: ChatContextItem[];
  onRemove: (item: ChatContextItem) => void;
}

export function useMingoContextMemory(): MingoContextMemory {
  const openView = useMingoContextStore(s => s.openView);
  const recentViews = useMingoContextStore(s => s.recentViews);
  const removeView = useMingoContextStore(s => s.removeView);

  const items = useMemo<ChatContextItem[]>(
    () => (openView ? [openView, ...recentViews] : recentViews),
    [openView, recentViews],
  );

  // The store keys on `type:id`, which is exactly what the lib's row hands back.
  const onRemove = useCallback((item: ChatContextItem) => removeView(item), [removeView]);

  return useMemo(() => ({ items, onRemove }), [items, onRemove]);
}
