'use client';
import { useEffect, useState } from 'react';
import { useApp } from './index';
import { useUi } from './ui';

/** Rehydrates the persisted store on the client; returns true once ready. */
export function useHydrated(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.all([useApp.persist.rehydrate(), useUi.persist.rehydrate()]).finally(() => alive && setReady(true));
    return () => { alive = false; };
  }, []);
  return ready;
}
