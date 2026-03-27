import type { ReactNode } from "react";
import type { ComputationIssue } from "@core/contracts";

interface MetadataItem {
  label: string;
  value: string;
}

interface ResultPanelProps {
  eyebrow: string;
  title: string;
  value: string;
  detail: string;
  issues: ComputationIssue[];
  metadata: MetadataItem[];
  children?: ReactNode;
}

export function ResultPanel({ eyebrow, title, value, detail, issues, metadata, children }: ResultPanelProps) {
  return (
    <section className="panel result-panel">
      <header className="panel-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <span>{issues.length === 0 ? "ready" : `${issues.length} alert${issues.length === 1 ? "" : "s"}`}</span>
      </header>
      <div className="result-value">{value}</div>
      <p className="result-detail">{detail}</p>
      <dl className="meta-grid">
        {metadata.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      {issues.length > 0 ? (
        <ul className="issue-list">
          {issues.map((issue) => (
            <li key={issue.code}>
              <strong>{issue.severity}</strong>
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {children ? <div className="result-actions">{children}</div> : null}
    </section>
  );
}
