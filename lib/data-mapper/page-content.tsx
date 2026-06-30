import { dataMapperEngines } from "@/lib/data-mapper/engines";
import { dataMapperPages } from "@/lib/data-mapper/placeholders";

export function DataMapperPlaceholder({ pageKey }: { pageKey: keyof typeof dataMapperPages }) {
  const page = dataMapperPages[pageKey];

  return (
    <>
      <section className="hero">
        <p className="breadcrumb">{page.eyebrow}</p>
        <h1>{page.title}</h1>
        <p>{page.summary}</p>
      </section>

      <div className="grid">
        <section className="card">
          <div className="sectionHeader">
            <h2>Foundation scope</h2>
            <span className="badge">Placeholder</span>
          </div>
          <ul className="helpList">
            {page.capabilities.map((capability) => (
              <li key={capability}>{capability}</li>
            ))}
          </ul>
        </section>

        <section className="card">
          <div className="sectionHeader">
            <h2>Future build path</h2>
            <span className="badge">Not connected</span>
          </div>
          <ul className="helpList">
            {page.nextSteps.map((nextStep) => (
              <li key={nextStep}>{nextStep}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card">
        <div className="sectionHeader">
          <h2>Engine readiness</h2>
          <span className="muted">Architecture placeholders only</span>
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
