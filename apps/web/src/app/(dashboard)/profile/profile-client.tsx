"use client";

import { useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/top-bar";
import { updateProfile } from "./actions";
import { formatDate, formatDateShort } from "@/lib/format-date";

interface UserData {
  readonly id: string;
  readonly email: string;
  readonly display_name: string;
  readonly avatar_url: string | null;
  readonly github_username: string | null;
  readonly created_at: string;
}

interface OrgData {
  readonly name: string;
  readonly role: string;
}

interface ActivityData {
  readonly id: string;
  readonly action: string;
  readonly resource_type: string;
  readonly resource_id: string;
  readonly created_at: string;
}

interface ProfileClientProps {
  readonly user: UserData;
  readonly org: OrgData;
  readonly recentActivity: readonly ActivityData[];
}

const ACTION_ICON: Record<string, string> = {
  create: "add_circle",
  update: "edit",
  delete: "delete",
  trigger: "play_arrow",
  approve: "check_circle",
  reject: "cancel",
  rollback: "undo",
  login: "login",
};

export function ProfileClient({
  user,
  org,
  recentActivity,
}: ProfileClientProps) {
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user.display_name);
  const router = useRouter();

  const [state, formAction] = useActionState(updateProfile, {});

  return (
    <>
      <TopBar breadcrumbs={[{ label: "Profile" }]} />

      <div className="p-8 max-w-3xl">
        <div className="border border-outline-variant/10 rounded-lg p-6 mb-6">
          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-full bg-surface-container-highest flex items-center justify-center overflow-hidden border border-outline-variant/30 flex-shrink-0">
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.display_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="material-symbols-outlined text-3xl text-on-surface-variant">
                  person
                </span>
              )}
            </div>

            <div className="flex-1">
              {editing ? (
                <form action={formAction} className="space-y-3">
                  <div>
                    <label className="block text-xs text-on-surface-variant/60 mb-1">
                      Display Name
                    </label>
                    <input
                      name="display_name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full bg-surface-container-low border border-outline-variant/20 rounded-md px-3 py-2 text-sm text-on-surface"
                    />
                  </div>
                  {state.fieldErrors?.display_name && (
                    <p className="text-error text-xs">
                      {state.fieldErrors.display_name[0]}
                    </p>
                  )}
                  {state.error && (
                    <p className="text-error text-xs">{state.error}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-primary text-on-primary rounded-md text-xs font-medium"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(false);
                        setDisplayName(user.display_name);
                      }}
                      className="px-3 py-1.5 text-on-surface-variant text-xs hover:bg-surface-container-high rounded-md"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-on-surface">
                      {user.display_name}
                    </h2>
                    <button
                      onClick={() => setEditing(true)}
                      className="text-on-surface-variant/40 hover:text-on-surface-variant transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">
                        edit
                      </span>
                    </button>
                  </div>
                  <p className="text-sm text-on-surface-variant/60 mt-1">
                    {user.email}
                  </p>
                </>
              )}

              <div className="flex gap-4 mt-3 text-xs text-on-surface-variant/50">
                {user.github_username && (
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">
                      code
                    </span>
                    {user.github_username}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">
                    group
                  </span>
                  {org.name} ({org.role})
                </span>
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">
                    calendar_today
                  </span>
                  Joined {formatDateShort(user.created_at)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <h3 className="text-sm font-semibold text-on-surface mb-3">
          Recent Activity
        </h3>
        {recentActivity.length === 0 ? (
          <p className="text-sm text-on-surface-variant/40">
            No recent activity
          </p>
        ) : (
          <div className="space-y-2">
            {recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center gap-3 py-2 text-sm"
              >
                <span className="material-symbols-outlined text-lg text-on-surface-variant/40">
                  {ACTION_ICON[activity.action] ?? "info"}
                </span>
                <span className="text-on-surface-variant/60 capitalize">
                  {activity.action}
                </span>
                <span className="text-on-surface">
                  {activity.resource_type}
                </span>
                <span className="font-mono text-on-surface-variant/30 text-xs">
                  {activity.resource_id.slice(0, 8)}
                </span>
                <span className="ml-auto text-xs text-on-surface-variant/40">
                  {formatDate(activity.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
