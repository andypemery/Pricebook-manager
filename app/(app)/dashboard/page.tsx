export const dynamic = "force-dynamic";

import Link from "next/link";
import { Columns3, Upload } from "lucide-react";
import { OutputProfileWorkspace } from "@/components/data-mapper/output-profile-workspace";
import { requireUser } from "@/lib/auth";
import { listOutputProfileWorkspace } from "@/lib/data-mapper/output-profiles/repository";
import { prisma } from "@/lib/prisma";

export default async function Dashboard() {
  const actor = await requireUser();
  const workspace = await listOutputProfileWorkspace(prisma, actor.tenantId);

  return (
    <>
      <section className="hero dashboardHeader">
        <div className="splitHero">
          <div>
            <p className="breadcrumb">Axiom Data Mapper</p>
            <h1>Dashboard</h1>
            <p>Continue recent work or start with a new workbook.</p>
          </div>
          <div className="actions">
            <Link className="primary" href="/workbook"><Upload aria-hidden="true" size={18} />Upload workbook</Link>
            <Link className="secondary" href="/mapping"><Columns3 aria-hidden="true" size={18} />Output Profiles</Link>
          </div>
        </div>
      </section>

      <OutputProfileWorkspace workspace={workspace} />
    </>
  );
}
