import Link from "next/link";
import { createProjectAction } from "@/lib/actions/project.actions";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export default async function NewProjectPage() {
  const actor = await requireUser();
  const canCreate = hasPermission(actor, "createRecords");
  async function createProjectForm(formData: FormData) { "use server"; await createProjectAction(formData); }
  return <section className="card formCard"><p className="breadcrumb">Projects</p><h1>New Project</h1><p className="muted">Create the Project shell first. You can upload its workbook next.</p>{canCreate ? <form action={createProjectForm} className="stackedForm"><label className="field"><span>Project name</span><input name="name" maxLength={120} required autoFocus /></label><div className="actions"><button className="primary" type="submit">Create project</button><Link className="secondary" href="/projects">Cancel</Link></div></form> : <p className="warningBox">You do not have permission to create Projects.</p>}</section>;
}
