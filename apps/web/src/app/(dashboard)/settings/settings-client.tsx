"use client";

import { useState, useTransition, useActionState } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { hasMinRole } from "@deployx/shared";
import {
  inviteMember,
  updateMemberRole,
  removeMember,
  cancelInvite,
  acceptInvite,
  declineInvite,
} from "./actions";

// ── Data interfaces ──

interface MemberData {
  readonly user_id: string;
  readonly role: string;
  readonly created_at: string;
  readonly display_name: string;
  readonly avatar_url: string | null;
  readonly github_username: string | null;
}

interface InviteData {
  readonly id: string;
  readonly email: string;
  readonly role: string;
  readonly invited_by: string;
  readonly expires_at: string;
  readonly created_at: string;
}

interface MyInviteData {
  readonly id: string;
  readonly org_id: string;
  readonly org_name: string;
  readonly role: string;
  readonly expires_at: string;
  readonly created_at: string;
}

interface SettingsClientProps {
  readonly org: { readonly id: string; readonly name: string; readonly slug: string };
  readonly currentUserId: string;
  readonly currentRole: string;
  readonly members: readonly MemberData[];
  readonly pendingInvites: readonly InviteData[];
  readonly myInvites: readonly MyInviteData[];
}

// ── Styling ──

type SettingsTab = "general" | "members" | "danger";

const ROLE_BADGE: Record<string, string> = {
  owner: "bg-tertiary/10 text-tertiary border-tertiary/20",
  admin: "bg-primary/10 text-primary border-primary/20",
  developer: "bg-outline/10 text-on-surface-variant border-outline/20",
  viewer: "bg-outline/10 text-on-surface-variant/60 border-outline/10",
};

const ROLE_OPTIONS = [
  { value: "viewer", label: "Viewer" },
  { value: "developer", label: "Developer" },
  { value: "admin", label: "Admin" },
] as const;

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Main Component ──

export function SettingsClient({
  org,
  currentUserId,
  currentRole,
  members,
  pendingInvites,
  myInvites,
}: SettingsClientProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("members");
  const canManage = hasMinRole(currentRole, "admin");

  return (
    <>
      <TopBar breadcrumbs={[{ label: "Settings" }]} />
      <div className="px-8 py-8 max-w-6xl mx-auto">
        {/* Pending invites banner for current user */}
        {myInvites.length > 0 && (
          <InviteBanner invites={myInvites} />
        )}

        {/* Tabs */}
        <nav className="flex space-x-8 border-b border-outline-variant/20 mb-8">
          <TabButton
            label="General"
            active={activeTab === "general"}
            onClick={() => setActiveTab("general")}
          />
          <TabButton
            label="Members"
            active={activeTab === "members"}
            onClick={() => setActiveTab("members")}
            count={members.length}
          />
          <TabButton
            label="Danger Zone"
            active={activeTab === "danger"}
            onClick={() => setActiveTab("danger")}
            variant="danger"
          />
        </nav>

        {activeTab === "general" && <GeneralTab org={org} />}
        {activeTab === "members" && (
          <MembersTab
            members={members}
            pendingInvites={pendingInvites}
            currentUserId={currentUserId}
            currentRole={currentRole}
            canManage={canManage}
          />
        )}
        {activeTab === "danger" && <DangerTab />}
      </div>
    </>
  );
}

// ── Tab Button ──

function TabButton({
  label,
  active,
  onClick,
  count,
  variant,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly onClick: () => void;
  readonly count?: number;
  readonly variant?: "danger";
}) {
  const isDanger = variant === "danger";
  return (
    <button
      onClick={onClick}
      className={`pb-4 text-sm font-medium transition-colors relative ${
        active
          ? isDanger
            ? "text-error font-bold"
            : "text-primary font-bold"
          : isDanger
            ? "text-error/60 hover:text-error"
            : "text-on-surface-variant hover:text-primary"
      }`}
    >
      {label}
      {count !== undefined && (
        <span className="ml-1.5 text-xs text-on-surface-variant/50">({count})</span>
      )}
      {active && (
        <span
          className={`absolute bottom-0 left-0 w-full h-[2px] ${isDanger ? "bg-error" : "bg-primary"}`}
        />
      )}
    </button>
  );
}

// ── Invite Banner ──

function InviteBanner({ invites }: { readonly invites: readonly MyInviteData[] }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mb-6 space-y-3">
      {invites.map((inv) => (
        <div
          key={inv.id}
          className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary">mail</span>
            <div>
              <p className="text-sm font-medium text-on-surface">
                You&apos;ve been invited to join <strong>{inv.org_name}</strong> as{" "}
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold border ${ROLE_BADGE[inv.role] ?? ROLE_BADGE.viewer}`}>
                  {inv.role}
                </span>
              </p>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Expires {formatDate(inv.expires_at)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await acceptInvite(inv.id);
                })
              }
              className="bg-primary text-on-primary px-4 py-1.5 rounded-md text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50"
            >
              Accept
            </button>
            <button
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await declineInvite(inv.id);
                })
              }
              className="text-on-surface-variant hover:text-error px-3 py-1.5 rounded-md text-sm transition-all disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── General Tab ──

function GeneralTab({ org }: { readonly org: { readonly name: string; readonly slug: string } }) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight mb-1">
          Organization Details
        </h2>
        <p className="text-on-surface-variant text-sm">
          Manage your organization&apos;s profile and preferences.
        </p>
      </div>
      <div className="bg-surface-container-low rounded-lg p-6 border border-outline-variant/10 space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest">
            Organization Name
          </label>
          <input
            type="text"
            defaultValue={org.name}
            placeholder="Your organization"
            className="w-full max-w-md bg-surface-container-lowest border-none rounded-md px-4 py-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary transition-all"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest">
            Slug
          </label>
          <input
            type="text"
            disabled
            defaultValue={org.slug}
            className="w-full max-w-md bg-surface-container-lowest/50 border-none rounded-md px-4 py-2.5 text-sm text-on-surface-variant/50 cursor-not-allowed"
          />
        </div>
      </div>
    </div>
  );
}

// ── Members Tab ──

function MembersTab({
  members,
  pendingInvites,
  currentUserId,
  currentRole,
  canManage,
}: {
  readonly members: readonly MemberData[];
  readonly pendingInvites: readonly InviteData[];
  readonly currentUserId: string;
  readonly currentRole: string;
  readonly canManage: boolean;
}) {
  const [showInviteForm, setShowInviteForm] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight mb-1">
            Organization Members
          </h2>
          <p className="text-on-surface-variant text-sm">
            Manage who has access to your organization&apos;s deployment
            pipelines and cloud resources.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowInviteForm(!showInviteForm)}
            className="bg-primary hover:bg-primary-container text-on-primary font-bold py-2.5 px-5 rounded-md flex items-center gap-2 transition-all shadow-lg shadow-primary/10"
          >
            <span className="material-symbols-outlined text-[20px]">
              person_add
            </span>
            <span className="text-sm">Invite Member</span>
          </button>
        )}
      </div>

      {/* Invite Form */}
      {showInviteForm && canManage && (
        <InviteForm onClose={() => setShowInviteForm(false)} />
      )}

      {/* Members Table */}
      <div className="bg-surface-container-low rounded-lg overflow-hidden border border-outline-variant/10">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container text-on-surface-variant">
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest">
                Member
              </th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest">
                Role
              </th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest">
                Joined
              </th>
              {canManage && (
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-right">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/5">
            {members.map((member) => (
              <MemberRow
                key={member.user_id}
                member={member}
                currentUserId={currentUserId}
                currentRole={currentRole}
                canManage={canManage}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-bold mb-4">Pending Invites</h3>
          <div className="bg-surface-container-low rounded-lg overflow-hidden border border-outline-variant/10">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container text-on-surface-variant">
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest">
                    Email
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest">
                    Role
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest">
                    Expires
                  </th>
                  {canManage && (
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-right">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {pendingInvites.map((invite) => (
                  <InviteRow
                    key={invite.id}
                    invite={invite}
                    canManage={canManage}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Security Panel */}
      <div className="mt-12 p-6 bg-surface-container-lowest rounded-lg border border-outline-variant/15 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="w-12 h-12 flex items-center justify-center rounded-lg bg-tertiary-container/20">
            <span className="material-symbols-outlined text-tertiary">
              shield_with_heart
            </span>
          </div>
          <div>
            <h3 className="font-bold text-on-surface">
              Organization Security
            </h3>
            <p className="text-sm text-on-surface-variant">
              {members.length} member{members.length !== 1 ? "s" : ""} &middot;{" "}
              {pendingInvites.length} pending invite{pendingInvites.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Invite Form ──

function InviteForm({ onClose }: { readonly onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(inviteMember, {});

  if (state.success) {
    onClose();
  }

  return (
    <div className="mb-6 bg-surface-container-low rounded-lg p-6 border border-primary/20">
      <h3 className="font-bold text-on-surface mb-4">Invite a New Member</h3>
      <form action={formAction} className="flex items-end gap-4">
        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest">
            Email Address
          </label>
          <input
            name="email"
            type="email"
            required
            placeholder="colleague@company.com"
            className="w-full bg-surface-container-lowest border-none rounded-md px-4 py-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary transition-all"
          />
          {state.fieldErrors?.email && (
            <p className="text-xs text-error">{state.fieldErrors.email[0]}</p>
          )}
        </div>
        <div className="w-40 space-y-1.5">
          <label className="text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest">
            Role
          </label>
          <select
            name="role"
            defaultValue="developer"
            className="w-full bg-surface-container-lowest border-none rounded-md px-4 py-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary transition-all"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {state.fieldErrors?.role && (
            <p className="text-xs text-error">{state.fieldErrors.role[0]}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="bg-primary text-on-primary font-bold py-2.5 px-5 rounded-md text-sm hover:opacity-90 transition-all disabled:opacity-50"
        >
          {isPending ? "Sending..." : "Send Invite"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-on-surface-variant hover:text-on-surface py-2.5 px-3 rounded-md text-sm transition-all"
        >
          Cancel
        </button>
      </form>
      {state.error && (
        <p className="text-sm text-error mt-3">{state.error}</p>
      )}
    </div>
  );
}

// ── Member Row ──

function MemberRow({
  member,
  currentUserId,
  currentRole,
  canManage,
}: {
  readonly member: MemberData;
  readonly currentUserId: string;
  readonly currentRole: string;
  readonly canManage: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [editingRole, setEditingRole] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const isCurrentUser = member.user_id === currentUserId;
  const isOwner = member.role === "owner";
  const canEdit = canManage && !isCurrentUser && !isOwner;
  // Admins can only manage developers and viewers
  const canRemove =
    canEdit && (currentRole === "owner" || member.role !== "admin");

  return (
    <tr className="hover:bg-surface-container-high/30 transition-colors">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          {member.avatar_url ? (
            <img
              src={member.avatar_url}
              alt=""
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-bold text-primary">
                {member.display_name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-on-surface">
              {member.display_name}
              {isCurrentUser && (
                <span className="text-xs text-on-surface-variant/50 ml-1.5">
                  (you)
                </span>
              )}
            </p>
            {member.github_username && (
              <p className="text-xs text-on-surface-variant/60">
                @{member.github_username}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        {editingRole && canEdit ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              startTransition(async () => {
                await updateMemberRole(member.user_id, {}, fd);
                setEditingRole(false);
              });
            }}
            className="flex items-center gap-2"
          >
            <select
              name="role"
              defaultValue={member.role}
              className="bg-surface-container-lowest border-none rounded px-2 py-1 text-xs focus:ring-1 focus:ring-primary"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={isPending}
              className="text-primary text-xs font-bold disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditingRole(false)}
              className="text-on-surface-variant text-xs"
            >
              Cancel
            </button>
          </form>
        ) : (
          <span
            className={`inline-block px-2.5 py-1 rounded text-xs font-bold border ${ROLE_BADGE[member.role] ?? ROLE_BADGE.viewer}`}
          >
            {member.role}
          </span>
        )}
      </td>
      <td className="px-6 py-4 text-sm text-on-surface-variant">
        {formatDate(member.created_at)}
      </td>
      {canManage && (
        <td className="px-6 py-4 text-right">
          {canEdit && !confirmRemove && (
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setEditingRole(true)}
                className="text-on-surface-variant/60 hover:text-primary text-xs font-medium transition-colors"
              >
                Change Role
              </button>
              {canRemove && (
                <button
                  onClick={() => setConfirmRemove(true)}
                  className="text-on-surface-variant/60 hover:text-error text-xs font-medium transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          )}
          {confirmRemove && (
            <div className="flex items-center justify-end gap-2">
              <span className="text-xs text-error">Remove?</span>
              <button
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await removeMember(member.user_id);
                    setConfirmRemove(false);
                  })
                }
                className="text-error text-xs font-bold disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmRemove(false)}
                className="text-on-surface-variant text-xs"
              >
                Cancel
              </button>
            </div>
          )}
        </td>
      )}
    </tr>
  );
}

// ── Invite Row ──

function InviteRow({
  invite,
  canManage,
}: {
  readonly invite: InviteData;
  readonly canManage: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const isExpired = new Date(invite.expires_at) < new Date();

  return (
    <tr className="hover:bg-surface-container-high/30 transition-colors">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-on-surface-variant/40 text-[20px]">
            mail
          </span>
          <span className="text-sm text-on-surface">{invite.email}</span>
        </div>
      </td>
      <td className="px-6 py-4">
        <span
          className={`inline-block px-2.5 py-1 rounded text-xs font-bold border ${ROLE_BADGE[invite.role] ?? ROLE_BADGE.viewer}`}
        >
          {invite.role}
        </span>
      </td>
      <td className="px-6 py-4 text-sm text-on-surface-variant">
        {isExpired ? (
          <span className="text-error">Expired</span>
        ) : (
          formatDate(invite.expires_at)
        )}
      </td>
      {canManage && (
        <td className="px-6 py-4 text-right">
          <button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await cancelInvite(invite.id);
              })
            }
            className="text-on-surface-variant/60 hover:text-error text-xs font-medium transition-colors disabled:opacity-50"
          >
            {isPending ? "Cancelling..." : "Cancel Invite"}
          </button>
        </td>
      )}
    </tr>
  );
}

// ── Danger Tab ──

function DangerTab() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight mb-1 text-error">
          Danger Zone
        </h2>
        <p className="text-on-surface-variant text-sm">
          Irreversible actions. Proceed with caution.
        </p>
      </div>
      <div className="bg-error-container/10 border border-error/20 rounded-lg p-6 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-on-surface">Delete Organization</h3>
          <p className="text-sm text-on-surface-variant mt-1">
            Permanently delete this organization and all associated data.
          </p>
        </div>
        <button
          disabled
          className="bg-error text-on-error px-4 py-2 rounded-md text-sm font-bold transition-all opacity-50 cursor-not-allowed"
          title="Coming soon"
        >
          Delete Organization
        </button>
      </div>
    </div>
  );
}
