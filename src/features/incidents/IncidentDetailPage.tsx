import { useState } from "react";
import type { ChangeEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  useDeleteIncidentEvidence,
  useDownloadIncidentEvidence,
  useIncident,
  useIncidentActivity,
  useIncidentEvidence,
  useUploadIncidentEvidence,
} from "./useIncidentData";
import type { IncidentDetail } from "./incidentTypes";

function formatLabel(value: string | null) {
  return value
    ? value
        .replaceAll("_", " ")
        .replace(/\b\w/g, (character) => character.toUpperCase())
    : "Not available";
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Not available";
}

function IncidentStatus({ status }: { status: IncidentDetail["status"] }) {
  return (
    <span className={`incident-status-badge status-${status}`}>
      {formatLabel(status)}
    </span>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="incident-detail-item">
      <span>{label}</span>
      <strong>{value || "Not available"}</strong>
    </div>
  );
}

export function IncidentDetailPage({
  supabase,
  incidentId,
}: {
  supabase: SupabaseClient;
  incidentId: string | null;
}) {
  const incident = useIncident(supabase, incidentId);
  const activity = useIncidentActivity(supabase, incidentId);
  const evidence = useIncidentEvidence(supabase, incidentId);
  const uploadEvidence = useUploadIncidentEvidence(supabase);
  const deleteEvidence = useDeleteIncidentEvidence(supabase);
  const downloadEvidence = useDownloadIncidentEvidence(supabase);
  const [evidenceMessage, setEvidenceMessage] = useState("");
  const [evidenceError, setEvidenceError] = useState("");

  if (!incidentId)
    return (
      <div className="workspace-panel">
        <div className="auth-message error">No incident ID was provided.</div>
        <a
          className="button button-outline workspace-back-link"
          href="#my-reports"
        >
          Return to My Reports
        </a>
      </div>
    );
  if (incident.isLoading)
    return <div className="workspace-panel">Loading incident details...</div>;
  if (incident.isError || !incident.data)
    return (
      <div className="workspace-panel">
        <div className="auth-message error">
          Unable to load this incident. It may not exist or you may not have
          access.
        </div>
        <a
          className="button button-outline workspace-back-link"
          href="#my-reports"
        >
          Return to My Reports
        </a>
      </div>
    );

  const data = incident.data;
  const evidenceFiles = evidence.data || data.evidence;
  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !incidentId) return;
    setEvidenceError("");
    setEvidenceMessage("");
    try {
      await uploadEvidence.mutateAsync({ incidentId, file });
      setEvidenceMessage("Evidence uploaded securely.");
    } catch (error) {
      setEvidenceError(
        error instanceof Error ? error.message : "Unable to upload evidence.",
      );
    }
  };
  const handleDownload = async (evidenceId: string) => {
    setEvidenceError("");
    try {
      const result = await downloadEvidence.mutateAsync(evidenceId);
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setEvidenceError(
        error instanceof Error ? error.message : "Unable to download evidence.",
      );
    }
  };
  const handleDelete = async (evidenceId: string) => {
    if (!incidentId || !window.confirm("Remove this evidence file?")) return;
    setEvidenceError("");
    try {
      await deleteEvidence.mutateAsync({
        evidenceId,
        organizationId: data.organizationId,
        incidentId,
      });
      setEvidenceMessage("Evidence removed.");
    } catch (error) {
      setEvidenceError(
        error instanceof Error
          ? error.message
          : "You are not authorized to remove this evidence.",
      );
    }
  };
  return (
    <div className="incident-detail-page">
      <div className="incident-detail-header">
        <div>
          <div className="eyebrow">INCIDENT DETAIL</div>
          <h2>{data.title}</h2>
          <p>
            {data.referenceNumber} · {formatLabel(data.reportType)}
          </p>
        </div>
        <div className="incident-detail-status">
          <IncidentStatus status={data.status} />
          <span>
            {data.severity || data.potentialSeverity || "Severity not set"}
          </span>
        </div>
      </div>
      <div className="incident-detail-actions">
        <a className="button button-outline button-small" href="#my-reports">
          ← My Reports
        </a>
        <span className="incident-detail-future">
          Investigation and corrective-action workflow will be added in the next
          operational module.
        </span>
      </div>
      <div className="incident-detail-grid">
        <section className="workspace-panel">
          <div className="eyebrow">EVENT</div>
          <h3>Event information</h3>
          <div className="incident-detail-items">
            <DetailItem label="Description" value={data.description} />
            <DetailItem
              label="Occurrence"
              value={formatDate(data.occurredAt)}
            />
            <DetailItem label="Reported" value={formatDate(data.reportedAt)} />
            <DetailItem label="Location" value={data.location} />
            <DetailItem label="Department" value={data.department} />
            <DetailItem label="Shift" value={data.shift} />
            <DetailItem
              label="Work/activity context"
              value={data.workActivityContext}
            />
          </div>
        </section>
        <section className="workspace-panel">
          <div className="eyebrow">CLASSIFICATION</div>
          <h3>Classification</h3>
          <div className="incident-detail-items">
            <DetailItem
              label="Report type"
              value={formatLabel(data.reportType)}
            />
            <DetailItem label="Status" value={formatLabel(data.status)} />
            <DetailItem label="Actual severity" value={data.severity} />
            <DetailItem
              label="Potential severity"
              value={data.potentialSeverity}
            />
            <DetailItem
              label="Incident category"
              value={data.incidentCategory}
            />
            <DetailItem
              label="Environmental impact"
              value={data.environmentalImpact ? "Yes" : "No"}
            />
            <DetailItem
              label="Injury or illness"
              value={data.injuryOrIllness ? "Yes" : "No"}
            />
            <DetailItem
              label="Property damage"
              value={data.propertyDamage ? "Yes" : "No"}
            />
            <DetailItem
              label="Work-related"
              value={data.workRelated ? "Yes" : "No"}
            />
          </div>
        </section>
        <section className="workspace-panel">
          <div className="eyebrow">PEOPLE</div>
          <h3>People and involvement</h3>
          <div className="incident-detail-items">
            <DetailItem label="Reporter" value={data.reportedBy} />
            <DetailItem
              label="Contractor involved"
              value={data.contractorInvolved ? "Yes" : "No"}
            />
            <DetailItem
              label="Contractor organization"
              value={data.contractorOrganization}
            />
          </div>
          {data.people.length ? (
            <div className="incident-people-list">
              {data.people.map((person) => (
                <div key={person.id}>
                  <strong>{person.fullName}</strong>
                  <span>
                    {formatLabel(person.personType)}
                    {person.organizationName
                      ? ` · ${person.organizationName}`
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="incident-detail-muted">
              No affected person or witness records.
            </p>
          )}
        </section>
        <section className="workspace-panel">
          <div className="eyebrow">IMMEDIATE RESPONSE</div>
          <h3>Immediate correction</h3>
          <p className="incident-detail-copy">
            {data.immediateCorrection ||
              "No immediate correction has been recorded."}
          </p>
          <p className="incident-detail-muted">
            Corrective actions addressing underlying causes belong to the future
            Corrective Action module.
          </p>
        </section>
        <section className="workspace-panel">
          <div className="eyebrow">EVIDENCE</div>
          <h3>Attachments</h3>
          <div className="incident-evidence-actions">
            <label className="button button-outline button-small">
              Upload evidence
              <input
                type="file"
                hidden
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                onChange={handleUpload}
                disabled={uploadEvidence.isPending}
              />
            </label>
            <span>Private, organization-scoped files up to 10 MB.</span>
          </div>
          {evidenceError && (
            <div className="auth-message error" role="alert">
              {evidenceError}
            </div>
          )}
          {evidenceMessage && (
            <div className="auth-message success" role="status">
              {evidenceMessage}
            </div>
          )}
          {evidence.isLoading ? (
            <p className="incident-detail-muted">Loading evidence...</p>
          ) : evidenceFiles.length ? (
            <div className="incident-evidence-list">
              {evidenceFiles.map((file) => (
                <div key={file.id}>
                  <strong>{file.originalFilename}</strong>
                  <span>
                    {file.mimeType} · {Math.ceil(file.fileSize / 1024)} KB
                  </span>
                  <div className="incident-evidence-buttons">
                    <button
                      className="table-action"
                      type="button"
                      onClick={() => void handleDownload(file.id)}
                      disabled={downloadEvidence.isPending}
                    >
                      Download
                    </button>
                    <button
                      className="table-action"
                      type="button"
                      onClick={() => void handleDelete(file.id)}
                      disabled={deleteEvidence.isPending}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="incident-detail-muted">
              No evidence has been attached.
            </p>
          )}
        </section>
        <section className="workspace-panel">
          <div className="eyebrow">AUDIT HISTORY</div>
          <h3>Activity</h3>
          {activity.isLoading ? (
            <p className="incident-detail-muted">
              Loading incident activity...
            </p>
          ) : activity.isError ? (
            <div className="auth-message error">
              Unable to load incident history.
            </div>
          ) : activity.data?.length ? (
            <div className="incident-activity-list">
              {activity.data.map((item) => (
                <div key={item.id}>
                  <time>{formatDate(item.createdAt)}</time>
                  <strong>{item.activity}</strong>
                  <span>{item.location || "Organization workspace"}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="incident-detail-muted">
              No incident activity has been recorded.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
