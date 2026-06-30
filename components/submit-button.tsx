"use client";
import { useFormStatus } from "react-dom";
export function SubmitButton({children}:{children:React.ReactNode}){ const {pending}=useFormStatus(); return <button className="primary" disabled={pending}>{pending?"Saving...":children}</button>; }
