export const dynamic = "force-dynamic";

import Link from "next/link";
import { FileSpreadsheet, Upload } from "lucide-react";
import { dataMapperEngines } from "@/lib/data-mapper/engines";
import {
  dashboardMetrics,
  latestGeneratedFiles,
  recentImports,
  recentProjects,
  validationSummary
} from "@/lib/data-mapper/placeholders";

export default async function Dashboard() {
  return (
    <>
      <section className="hero">
        <div className="splitHero">
          <div>
            <p className="breadcrumb">Axiom Data Mapper</p>
            <h1>Pricebook import and export control centre</h1>
            <p>
              Track workbook intake, validation progress, month-on-month comparison and controlled file generation from one operational workspace.
            </p>
          </div>
          <div className="actions">
            <Link className="primary" href="/workbook">
              <Upload aria-hidden="true" size={18} />
              Upload workbook
            </Link>
            <Link className="secondary" href="/projects">View projects</Link>
          </div>
        </div>
      </section>

      <section className="grid compactGrid">
        {dashboardMetrics.map((metric) => (
          <div className="card" key={metric.label}>
            <span className="labelText">{metric.label}</span>
            <h2 className="dashboardMetric">{metric.value}</h2>
            <p className="muted">{metric.detail}</p>
          </div>
        ))}
      </section>

      <div className="dashboardLayout">
        <section className="card">
          <div className="sectionHeader">
            <h2>Upload workbook</h2>
            <span className="badge">Foundation only</span>
          </div>
          <div className="uploadPanel">
            <span className="tileIcon"><FileSpreadsheet aria-hidden="true" width={22} height={22} /></span>
            <div>
              <strong>Master pricebook workbook</strong>
              <p className="muted">Excel import will be connected in a later phase. This placeholder reserves the workflow for large multi-tab workbooks.</p>
            </div>
          </div>
          <div className="actions">
            <Link className="secondary" href="/workbook">Review workbook area</Link>
          </div>
        </section>

        <section className="card">
          <div className="sectionHeader">
            <h2>Validation status</h2>
            <span className="badge warning">Awaiting review</span>
          </div>
          <div className="summaryGrid">
            {validationSummary.map((item) => (
              <div key={item.label}>
                <strong>{item.value}</strong>
                <span className={item.tone}>{item.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="dashboardLayout">
        <section className="card">
          <div className="sectionHeader">
            <h2>Recent projects</h2>
            <Link href="/projects">Open projects</Link>
          </div>
          <table className="table">
            <thead><tr><th>Project</th><th>Owner</th><th>Status</th><th>Updated</th></tr></thead>
            <tbody>
              {recentProjects.map((project) => (
                <tr key={project.name}>
                  <td>{project.name}</td>
                  <td>{project.owner}</td>
                  <td><span className="badge">{project.status}</span></td>
                  <td>{project.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <div className="sectionHeader">
            <h2>Recent imports</h2>
            <Link href="/workbook">Workbook</Link>
          </div>
          <table className="table">
            <thead><tr><th>File</th><th>Worksheets</th><th>Rows</th><th>Status</th></tr></thead>
            <tbody>
              {recentImports.map((importRecord) => (
                <tr key={importRecord.fileName}>
                  <td>{importRecord.fileName}</td>
                  <td>{importRecord.worksheets}</td>
                  <td>{importRecord.rows}</td>
                  <td>{importRecord.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <div className="dashboardLayout">
        <section className="card">
          <div className="sectionHeader">
            <h2>Comparison summary</h2>
            <Link href="/comparison">Review comparison</Link>
          </div>
          <div className="summaryGrid">
            <div><strong>1,284</strong><span>Price changes</span></div>
            <div><strong>312</strong><span>New products</span></div>
            <div><strong>89</strong><span>Removed products</span></div>
          </div>
        </section>

        <section className="card">
          <div className="sectionHeader">
            <h2>Latest generated files</h2>
            <Link href="/generate">Generate</Link>
          </div>
          <table className="table">
            <thead><tr><th>Output</th><th>Target</th><th>Status</th></tr></thead>
            <tbody>
              {latestGeneratedFiles.map((file) => (
                <tr key={file.name}>
                  <td>{file.name}</td>
                  <td>{file.target}</td>
                  <td>{file.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="card">
        <div className="sectionHeader">
          <h2>Architecture placeholders</h2>
          <span className="muted">Real import, mapping, formula, comparison and export processing is intentionally not implemented yet.</span>
        </div>
        <div className="grid compactGrid">
          {dataMapperEngines.map((engine) => (
            <div className="miniPanel" key={engine.key}>
              <span className="labelText">{engine.status}</span>
              <strong>{engine.name}</strong>
              <p className="muted">{engine.purpose}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
