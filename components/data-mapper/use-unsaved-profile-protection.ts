"use client";

import { useEffect } from "react";

const unsavedNavigationMessage = "You have unsaved Output Profile changes. Discard them and leave this page?";

export function shouldRegisterUnsavedProtection(isDirty: boolean) {
  return isDirty;
}

export function protectBeforeUnload(event: Pick<BeforeUnloadEvent, "preventDefault" | "returnValue">) {
  event.preventDefault();
  event.returnValue = "";
}

export function shouldConfirmInAppNavigation(input: {
  isDirty: boolean;
  currentHref: string;
  targetHref: string;
  opensNewContext: boolean;
  modifiedClick: boolean;
}) {
  if (!input.isDirty || input.opensNewContext || input.modifiedClick) return false;
  const current = new URL(input.currentHref);
  const target = new URL(input.targetHref, current);
  if (target.origin !== current.origin) return false;
  return `${target.pathname}${target.search}` !== `${current.pathname}${current.search}`;
}

export function useUnsavedProfileProtection(isDirty: boolean) {
  useEffect(() => {
    if (!shouldRegisterUnsavedProtection(isDirty)) return;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      protectBeforeUnload(event);
    }

    function onDocumentClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor) return;
      const shouldConfirm = shouldConfirmInAppNavigation({
        isDirty: true,
        currentHref: window.location.href,
        targetHref: anchor.href,
        opensNewContext: anchor.target === "_blank" || anchor.hasAttribute("download"),
        modifiedClick: event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
      });
      if (shouldConfirm && !window.confirm(unsavedNavigationMessage)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, [isDirty]);
}
