"use client";

import { useState } from "react";
import { Eye } from "lucide-react";

export function PasswordField({ name, label, autoComplete }: { name: string; label: string; autoComplete?: string }) {
  const [show, setShow] = useState(false);
  return (
    <label className="field">
      <span>{label}</span>
      <div className="passwordWrap">
        <input name={name} type={show ? "text" : "password"} autoComplete={autoComplete} required />
        <button
          type="button"
          className="passwordReveal"
          aria-label={show ? "Hide password" : "Show password"}
          onMouseDown={(event) => { event.preventDefault(); setShow(true); }}
          onMouseUp={() => setShow(false)}
          onMouseLeave={() => setShow(false)}
          onTouchStart={() => setShow(true)}
          onTouchEnd={() => setShow(false)}
          onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") setShow(true); }}
          onKeyUp={() => setShow(false)}
        >
          <Eye aria-hidden="true" size={18} strokeWidth={2} />
        </button>
      </div>
    </label>
  );
}
