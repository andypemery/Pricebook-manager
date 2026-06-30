export function StatusMessage({ success, error }: { success?: string; error?: string }){ if(!success && !error) return null; return <p className={error?"error":"success"}>{error || success}</p>; }
