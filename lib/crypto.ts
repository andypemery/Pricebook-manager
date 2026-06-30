import crypto from "crypto";
export function randomToken(bytes = 32){ return crypto.randomBytes(bytes).toString("hex"); }
export function sha256(value: string){ return crypto.createHash("sha256").update(value).digest("hex"); }
export function timingSafeEqual(a: string, b: string){ const ab=Buffer.from(a); const bb=Buffer.from(b); return ab.length===bb.length && crypto.timingSafeEqual(ab,bb); }
