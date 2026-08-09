"use client";

interface ApprovalVote {
  readonly name: string;
  readonly status: "approved" | "rejected" | "pending";
  readonly timestamp?: string;
}

interface ApprovalDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly imageTag: string;
  readonly requestedBy: string;
  readonly votes: readonly ApprovalVote[];
  readonly requiredVotes: number;
}

const VOTE_STATUS = {
  approved: {
    icon: "check_circle",
    iconClass: "text-tertiary",
    borderClass: "border-tertiary",
    label: "Approved",
  },
  rejected: {
    icon: "cancel",
    iconClass: "text-error",
    borderClass: "border-error",
    label: "Rejected",
  },
  pending: {
    icon: "pending",
    iconClass: "text-outline",
    borderClass: "border-outline-variant",
    label: "PENDING",
  },
} as const;

export function ApprovalDialog({
  open,
  onClose,
  imageTag,
  requestedBy,
  votes,
  requiredVotes,
}: ApprovalDialogProps) {
  if (!open) return null;

  const approvedCount = votes.filter((v) => v.status === "approved").length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-background/80 backdrop-blur-sm">
      <div className="bg-surface-container-high w-full max-w-2xl rounded-xl shadow-2xl ring-1 ring-outline-variant/15 overflow-hidden flex flex-col md:flex-row">
        {/* Left: Context */}
        <div className="w-full md:w-5/12 bg-surface-container p-8 border-r border-outline-variant/10 flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 bg-primary/10 flex items-center justify-center rounded-lg mb-6">
              <span className="material-symbols-outlined text-primary">
                rocket_launch
              </span>
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight mb-2 leading-tight">
              Deployment Approval Required
            </h2>
            <p className="text-on-surface-variant text-sm leading-relaxed mb-6">
              Critical gateway reached for production environment. Final human
              sign-off required to proceed with infrastructure changes.
            </p>
          </div>
          <div className="space-y-4">
            <div className="bg-surface-container-low p-3 rounded-lg flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center">
                <span className="material-symbols-outlined text-on-surface-variant">
                  person
                </span>
              </div>
              <div>
                <p className="text-xs text-on-surface-variant font-medium">
                  Requested by
                </p>
                <p className="text-sm font-bold">{requestedBy}</p>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
                Build Artifact
              </span>
              <div className="flex items-center gap-2 bg-surface-container-lowest border border-outline-variant/10 p-2 rounded px-3">
                <span className="material-symbols-outlined text-sm opacity-50">
                  data_object
                </span>
                <span className="text-xs font-mono">{imageTag}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Interaction */}
        <div className="w-full md:w-7/12 p-8 bg-surface-container-high">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
                Approval Status
              </h3>
              <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-bold">
                {approvedCount} / {requiredVotes} VOTES
              </span>
            </div>
            <ul className="space-y-3">
              {votes.map((vote) => {
                const status = VOTE_STATUS[vote.status];
                return (
                  <li
                    key={vote.name}
                    className={`flex items-center justify-between bg-surface-container p-3 rounded border-l-2 ${status.borderClass}`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`material-symbols-outlined text-sm ${status.iconClass}`}
                      >
                        {status.icon}
                      </span>
                      <span className="text-sm font-medium">{vote.name}</span>
                    </div>
                    <span className="text-[10px] opacity-60">
                      {vote.timestamp ?? status.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <form className="space-y-6">
            <div>
              <label
                htmlFor="approval-comments"
                className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2"
              >
                Approval Comments
              </label>
              <textarea
                id="approval-comments"
                rows={3}
                placeholder="Provide context for your decision..."
                className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-md text-sm p-4 focus:ring-1 focus:ring-primary focus:border-primary transition-all placeholder:text-outline-variant text-on-surface"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                className="flex items-center justify-center gap-2 bg-error text-on-error py-3 rounded-md font-bold text-sm hover:opacity-90 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-sm">
                  block
                </span>
                Reject
              </button>
              <button
                type="button"
                className="flex items-center justify-center gap-2 bg-gradient-to-br from-primary to-primary-container text-on-primary py-3 rounded-md font-bold text-sm hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-primary/20"
              >
                <span className="material-symbols-outlined text-sm">
                  verified
                </span>
                Approve
              </button>
            </div>
          </form>
          <button
            onClick={onClose}
            className="w-full mt-6 text-xs text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Close and view logs
          </button>
        </div>
      </div>
    </div>
  );
}
