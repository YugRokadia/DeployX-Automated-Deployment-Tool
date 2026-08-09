"use client";

import { useState } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { formatDate } from "@/lib/format-date";

interface AuditEventData {
  readonly id: string;
  readonly user_id: string;
  readonly user_name: string;
  readonly action: string;
  readonly resource_type: string;
  readonly resource_id: string;
  readonly details: Record<string, unknown> | null;
  readonly created_at: string;
}

interface MemberRef {
  readonly user_id: string;
  readonly display_name: string;
}

interface AuditLogClientProps {
  readonly orgId: string;
  readonly events: readonly AuditEventData[];
  readonly members: readonly MemberRef[];
}

const ACTION_BADGE: Record<string, { text: string; className: string }> = {
  create: { text: "Create", className: "bg-tertiary/10 text-tertiary" },
  update: { text: "Update", className: "bg-primary/10 text-primary" },
  delete: { text: "Delete", className: "bg-error/10 text-error" },
  trigger: { text: "Trigger", className: "bg-[#ffd54f]/10 text-[#ffd54f]" },
  approve: { text: "Approve", className: "bg-tertiary/10 text-tertiary" },
  reject: { text: "Reject", className: "bg-error/10 text-error" },
  rollback: { text: "Rollback", className: "bg-[#ffd54f]/10 text-[#ffd54f]" },
  login: { text: "Login", className: "bg-primary/10 text-primary" },
};

export function AuditLogClient({
  events,
  members,
}: AuditLogClientProps) {
  const [filterAction, setFilterAction] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredEvents = events.filter((e) => {
    if (filterAction && e.action !== filterAction) return false;
    if (filterUser && e.user_id !== filterUser) return false;
    return true;
  });

  return (
    <>
      <TopBar
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Audit Log" },
        ]}
      />

      <div className="p-8 max-w-5xl">
        <h2 className="text-xl font-bold text-on-surface mb-1">Audit Log</h2>
        <p className="text-sm text-on-surface-variant/60 mb-6">
          Track all actions performed in your organization
        </p>

        <div className="flex gap-3 mb-4">
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="bg-surface-container-low border border-outline-variant/20 rounded-md px-3 py-1.5 text-xs text-on-surface"
          >
            <option value="">All Actions</option>
            {Object.keys(ACTION_BADGE).map((action) => (
              <option key={action} value={action}>
                {ACTION_BADGE[action]!.text}
              </option>
            ))}
          </select>
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="bg-surface-container-low border border-outline-variant/20 rounded-md px-3 py-1.5 text-xs text-on-surface"
          >
            <option value="">All Users</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="border border-outline-variant/10 rounded-lg p-12 text-center">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-3 block">
              history
            </span>
            <p className="text-on-surface-variant/50 text-sm">
              No audit events found
            </p>
          </div>
        ) : (
          <div className="border border-outline-variant/10 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/10 text-on-surface-variant/50 text-xs">
                  <th className="text-left px-4 py-3 font-medium">Time</th>
                  <th className="text-left px-4 py-3 font-medium">User</th>
                  <th className="text-left px-4 py-3 font-medium">Action</th>
                  <th className="text-left px-4 py-3 font-medium">Resource</th>
                  <th className="text-left px-4 py-3 font-medium w-10" />
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((event) => {
                  const badge = ACTION_BADGE[event.action] ?? {
                    text: event.action,
                    className: "bg-surface-container-high text-on-surface-variant",
                  };
                  return (
                    <>
                      <tr
                        key={event.id}
                        className="border-b border-outline-variant/5 hover:bg-surface-container-high/50 transition-colors"
                      >
                        <td className="px-4 py-3 text-on-surface-variant/60 text-xs whitespace-nowrap">
                          {formatDate(event.created_at)}
                        </td>
                        <td className="px-4 py-3 text-on-surface">
                          {event.user_name}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${badge.className}`}
                          >
                            {badge.text}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-on-surface-variant/60 text-xs">
                          {event.resource_type}
                          <span className="ml-1 font-mono text-on-surface-variant/30">
                            {event.resource_id.slice(0, 8)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {event.details && (
                            <button
                              onClick={() =>
                                setExpandedId(
                                  expandedId === event.id ? null : event.id,
                                )
                              }
                              className="text-on-surface-variant/40 hover:text-on-surface-variant transition-colors"
                            >
                              <span className="material-symbols-outlined text-sm">
                                {expandedId === event.id
                                  ? "expand_less"
                                  : "expand_more"}
                              </span>
                            </button>
                          )}
                        </td>
                      </tr>
                      {expandedId === event.id && event.details && (
                        <tr key={`${event.id}-details`}>
                          <td
                            colSpan={5}
                            className="px-4 py-3 bg-surface-container-low"
                          >
                            <pre className="text-xs text-on-surface-variant/60 font-mono whitespace-pre-wrap">
                              {JSON.stringify(event.details, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
