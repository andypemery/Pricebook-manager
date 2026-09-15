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
      <section className="hero">
        <div className="splitHero">
          <div>
            <p className="breadcrumb">Axiom Data Mapper</p>
            <h1>Continue your pricebook work</h1>
            <p>Upload and validate a workbook, or reopen a saved Output Profile and continue where you left off.</p>
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
