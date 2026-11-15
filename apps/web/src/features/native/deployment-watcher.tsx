"use client";

import { useEffect } from "react";
import { isStaleDeploymentError, isUserTyping, reloadAllowed } from "./stale-deployment";
import { isOrionMacUserAgent } from "./user-agent";

const CHECK_EVERY_MS = 60_000;
const RELOADED_AT_KEY = "orion:stale-page-reloaded-at";

async function fetchDeploymentId(): Promise<string | null> {
  try {
    const response = await fetch("/api/version", { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { id?: unknown };
    return typeof body.id === "string" ? body.id : null;
  } catch {
    return null;
  }
}

/**
 * Invisible. In the Orion Mac app, an open window keeps the page it loaded, so
 * after a deploy its server calls start failing ("couldn't send", Canvas stuck
 * loading). This reloads the page once a newer deployment is live, or as soon
 * as a call fails because the page is out of date, but never while someone has
 * text typed in a field, and never more than once a minute.
 */
export function DeploymentWatcher({ reload = () => window.location.reload() }: { reload?: () => void }) {
  useEffect(() => {
    if (!isOrionMacUserAgent(navigator.userAgent)) return;
    let baseline: string | null = null;
    let reloadWanted = false;

    const tryReload = () => {
      if (!reloadWanted || isUserTyping(document)) return;
      const last = Number(window.sessionStorage.getItem(RELOADED_AT_KEY)) || null;
      if (!reloadAllowed(last, Date.now())) return;
      window.sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
      reload();
    };

    const check = async () => {
      const id = await fetchDeploymentId();
      if (id) {
        baseline ??= id;
        if (id !== baseline) reloadWanted = true;
      }
      tryReload();
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      if (!isStaleDeploymentError(event.reason)) return;
      reloadWanted = true; // the failure itself proves this page is out of date
      tryReload();
    };
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };

    void check();
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  return null;
}
