export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function FileRegisterPage({ searchParams }: { searchParams?: Promise<{ q?: string; status?: string }> }) {
  const user = await requireUser();
  if (!hasPermission(user, "manageCustomerSettings")) return <section className="card"><h1>File Register</h1><p>You do not have permission to view file metadata.</p></section>;
  const params = await searchParams;
  const q = params?.q?.trim() || "";
  const status = params?.status || "";
  const files = await prisma.fileReference.findMany({
    where: {
      tenantId: user.tenantId,
      deletedAt: null,
      ...(q ? { OR: [{ originalFileName: { contains: q, mode: "insensitive" } }, { fileType: { contains: q, mode: "insensitive" } }] } : {}),
      ...(status ? { retentionStatus: status } : {})
    },
    include: { tenant: true, sampleRecord: true },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return (
    <>
      <section className="hero">
        <p className="breadcrumb">Settings &gt; GDPR Features</p>
        <h1>File Register</h1>
        <p>The File Register helps you see what files are stored in this app, where they are linked, who uploaded them, and whether they are covered by storage, backup and retention controls. This helps customers keep a clear record of uploaded documents and files, especially where files may contain personal data or sensitive information. The register is metadata-first, so it shows file details without automatically opening or loading the full file.</p>
      </section>

      <section className="grid">
        <div className="card">
          <h2>How to use this section</h2>
          <ul className="helpList">
            <li>Use the register to review uploaded files and file metadata.</li>
            <li>Search or filter by file name, type, uploader, module, record, storage status, backup status or retention status where available.</li>
            <li>Use it during GDPR/data protection reviews to understand what files are held.</li>
            <li>Use it to check which records or people a file is linked to.</li>
            <li>Use it to check whether files are covered by backup and retention controls.</li>
            <li>Open or download files only where you have permission and a valid reason.</li>
            <li>The register should not automatically load full file contents.</li>
          </ul>
        </div>
        <div className="card">
          <h2>Why this matters</h2>
          <ul className="helpList">
            <li>Uploaded files may contain personal or sensitive information.</li>
            <li>Customers need a clear record of stored files for data protection and retention management.</li>
            <li>Metadata-first viewing reduces unnecessary access to file contents.</li>
            <li>File records help support audit, backup, retention and subject access request reviews.</li>
          </ul>
        </div>
      </section>

      <section className="card">
        <form className="filterBar">
          <label className="field"><span>Search</span><input name="q" defaultValue={q} placeholder="File name or type" /></label>
          <label className="field"><span>Retention status</span><select name="status" defaultValue={status}><option value="">All</option><option value="active">Active</option><option value="review">Review</option><option value="expired">Expired</option></select></label>
          <button className="secondary" type="submit">Apply filters</button>
        </form>
        <table className="table">
          <thead><tr><th>File</th><th>Type</th><th>Size</th><th>Uploaded</th><th>Linked record/module</th><th>Customer</th><th>Storage</th><th>Backup</th><th>Retention</th><th>Actions</th></tr></thead>
          <tbody>
            {files.length === 0 ? <tr><td colSpan={10}>No file metadata records exist yet.</td></tr> : files.map((file) => (
              <tr key={file.id}>
                <td>{file.originalFileName}</td>
                <td>{file.fileType || "Unknown"}</td>
                <td>{fileSize(file.fileSizeBytes)}</td>
                <td>{file.createdAt.toLocaleString("en-GB")}</td>
                <td>{file.sampleRecord ? `Demo Records / ${file.sampleRecord.title}` : "Not linked"}</td>
                <td>{file.tenant.name}</td>
                <td><span className="badge">{file.storageKey ? file.visibility : "Not configured"}</span></td>
                <td>{file.backupStorageKey ? <span className="badge">Backup reference recorded</span> : <span className="badge warning">Not configured yet</span>}</td>
                <td>{file.retentionStatus}</td>
                <td><span className="muted">Metadata view only</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
