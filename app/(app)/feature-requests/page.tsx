export const dynamic="force-dynamic";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { createFeatureRequest } from "@/lib/actions/support.actions";
import { SubmitButton } from "@/components/submit-button";

export default async function Feature(){ const user=await requireUser(); if(!hasPermission(user,"createRecords") && !hasPermission(user,"manageCustomerSettings")) return <section className="card"><h1>Feature request</h1><p>You do not have permission to submit feature requests.</p></section>; return <section className="card"><h1>Feature request</h1><form action={createFeatureRequest as unknown as (formData: FormData) => void}><label className="field"><span>Title</span><input name="title" required/></label><label className="field"><span>Request type</span><input name="requestType" defaultValue="Feature idea"/></label><label className="field"><span>Affected area</span><input name="affectedArea"/></label><label className="field"><span>Business reason</span><textarea name="businessReason" required/></label><label className="field"><span>Benefit</span><textarea name="benefit"/></label><SubmitButton>Submit request</SubmitButton></form></section>}
