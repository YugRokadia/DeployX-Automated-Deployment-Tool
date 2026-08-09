"use client";

import { NotificationDropdown } from "./notification-dropdown";
import { useUser } from "./user-context";

interface NotificationData {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly metadata: Record<string, unknown> | null;
  readonly is_read: boolean;
  readonly created_at: string;
}

interface TopBarProps {
  readonly breadcrumbs?: ReadonlyArray<{
    readonly label: string;
    readonly href?: string;
  }>;
  readonly userId?: string;
  readonly initialNotifications?: readonly NotificationData[];
  readonly initialUnreadCount?: number;
}

export function TopBar({
  breadcrumbs,
  userId,
  initialNotifications,
  initialUnreadCount,
}: TopBarProps) {
  const { avatarUrl, displayName } = useUser();

  return (
    <header className="flex items-center justify-between h-14 pl-8 pr-8 w-full sticky top-0 z-40 bg-surface/80 backdrop-blur-xl">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-on-surface-variant text-sm">
        {breadcrumbs?.map((crumb, i) => (
          <span key={crumb.label} className="flex items-center gap-2">
            {i > 0 && (
              <span className="material-symbols-outlined text-sm">
                chevron_right
              </span>
            )}
            {crumb.href ? (
              <a
                href={crumb.href}
                className="hover:text-primary transition-colors"
              >
                {crumb.label}
              </a>
            ) : (
              <span className="text-on-surface font-semibold">
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </div>

      {/* Right side: search, notifications, avatar */}
      <div className="flex items-center gap-6">
        <div className="relative flex items-center group">
          <span className="material-symbols-outlined absolute left-3 text-outline text-lg">
            search
          </span>
          <input
            type="text"
            placeholder="Search resources..."
            className="bg-surface-container-low border-none rounded-md pl-10 pr-4 py-1.5 text-xs w-64 focus:ring-1 focus:ring-primary/40 placeholder:text-outline/50 text-on-surface-variant transition-all"
          />
        </div>
        <div className="flex items-center gap-4 text-on-surface-variant/60">
          {userId ? (
            <NotificationDropdown
              userId={userId}
              initialNotifications={initialNotifications ?? []}
              initialUnreadCount={initialUnreadCount ?? 0}
            />
          ) : (
            <button className="hover:text-on-surface transition-all duration-200 relative">
              <span className="material-symbols-outlined">notifications</span>
              <span className="absolute top-0 right-0 w-2 h-2 bg-primary rounded-full border-2 border-surface" />
            </button>
          )}
          <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center overflow-hidden border border-outline-variant/30">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="material-symbols-outlined text-on-surface-variant">
                person
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
