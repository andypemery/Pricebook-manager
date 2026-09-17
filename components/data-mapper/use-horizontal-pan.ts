"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent, type PointerEventHandler } from "react";

export const horizontalPanMovementThreshold = 6;
export const horizontalPanIgnoredSelector = "a, button, input, select, textarea, label, [contenteditable='true'], [role='button'], [draggable='true'], [data-pan-ignore]";

export type HorizontalPanGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  startScrollLeft: number;
  status: "pending" | "panning";
};

export function isHorizontalPanIgnoredTarget(target: EventTarget | null) {
  const candidate = target as (EventTarget & { closest?: (selector: string) => unknown }) | null;
  return Boolean(candidate?.closest?.(horizontalPanIgnoredSelector));
}

export function moveHorizontalPanGesture(
  gesture: HorizontalPanGesture | null,
  pointerId: number,
  clientX: number,
  clientY: number
): { gesture: HorizontalPanGesture | null; scrollLeft: number | null; started: boolean } {
  if (!gesture || gesture.pointerId !== pointerId) return { gesture, scrollLeft: null, started: false };
  const movementX = clientX - gesture.startX;
  const movementY = clientY - gesture.startY;
  const horizontalDistance = Math.abs(movementX);
  const verticalDistance = Math.abs(movementY);

  if (gesture.status === "pending") {
    if (verticalDistance >= horizontalPanMovementThreshold && verticalDistance > horizontalDistance) {
      return { gesture: null, scrollLeft: null, started: false };
    }
    if (horizontalDistance < horizontalPanMovementThreshold || horizontalDistance <= verticalDistance) {
      return { gesture, scrollLeft: null, started: false };
    }
    const activeGesture = { ...gesture, status: "panning" as const };
    return { gesture: activeGesture, scrollLeft: gesture.startScrollLeft - movementX, started: true };
  }

  return { gesture, scrollLeft: gesture.startScrollLeft - movementX, started: false };
}

export function endHorizontalPanGesture(gesture: HorizontalPanGesture | null, pointerId: number) {
  return gesture?.pointerId === pointerId ? null : gesture;
}

export function useHorizontalPan<T extends HTMLElement>() {
  const gestureRef = useRef<HorizontalPanGesture | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const finish = (element: T, pointerId: number, releaseCapture = true) => {
    const nextGesture = endHorizontalPanGesture(gestureRef.current, pointerId);
    if (nextGesture === gestureRef.current) return;
    gestureRef.current = nextGesture;
    setIsPanning(false);
    if (releaseCapture && element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
  };

  const onPointerDown: PointerEventHandler<T> = (event) => {
    if ((event.pointerType === "mouse" && event.button !== 0) || isHorizontalPanIgnoredTarget(event.target)) return;
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: event.currentTarget.scrollLeft,
      status: "pending"
    };
  };

  const onPointerMove: PointerEventHandler<T> = (event) => {
    const movement = moveHorizontalPanGesture(gestureRef.current, event.pointerId, event.clientX, event.clientY);
    gestureRef.current = movement.gesture;
    if (!movement.gesture) {
      setIsPanning(false);
      return;
    }
    if (movement.started) {
      event.currentTarget.setPointerCapture(event.pointerId);
      document.getSelection()?.removeAllRanges();
      setIsPanning(true);
    }
    if (movement.scrollLeft !== null) {
      event.preventDefault();
      event.currentTarget.scrollLeft = movement.scrollLeft;
    }
  };

  const onPointerUp: PointerEventHandler<T> = (event) => finish(event.currentTarget, event.pointerId);
  const onPointerCancel: PointerEventHandler<T> = (event) => finish(event.currentTarget, event.pointerId);
  const onLostPointerCapture: PointerEventHandler<T> = (event) => finish(event.currentTarget, event.pointerId, false);
  const onPointerLeave: PointerEventHandler<T> = (event) => {
    if (gestureRef.current?.status === "pending") finish(event.currentTarget, event.pointerId, false);
  };

  return {
    isPanning,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onLostPointerCapture, onPointerLeave }
  };
}
