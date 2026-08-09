"use client";

import { useState, useRef, useEffect } from "react";
import { useRealtimeNotifications } from "@/hooks/use-realtime-notifications";
import {
  markNotificationsRead,
  markAllNotificationsRead,
} from "@/app/(dashboard)/notifications/actions";

interface NotificationData {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly metadata: Record<string, unknown> | null;
  readonly is_read: boolean;
  readonly created_at: string;
}

interface NotificationDropdownProps {
  readonly userId: string;
  readonly initialNotifications: readonly NotificationData[];
  readonly initialUnreadCount: number;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000,
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const TYPE_ICON: Record<string, string> = {
  alert_fired: "warning",
  deployment_status: "rocket_launch",
  pipeline_status: "account_tree",
  approval_requested: "approval",
  system: "info",
};

export function NotificationDropdown({
  userId,
  initialNotifications,
  initialUnreadCount,
}: NotificationDropdownProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markAsRead, markAllRead } =
    useRealtimeNotifications({
      userId,
      initialNotifications,
      initialUnreadCount,
    });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleMarkAllRead() {
    markAllRead();
    await markAllNotificationsRead();
  }

  async function handleNotificationClick(notification: NotificationData) {
    if (!notification.is_read) {
      markAsRead([notification.id]);
      await markNotificationsRead([notification.id]);
    }
    setOpen(false);
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="hover:text-on-surface transition-all duration-200 relative"
      >
        <span className="material-symbols-outlined">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-primary rounded-full flex items-center justify-center text-[10px] font-bold text-on-primary px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-surface-container border border-outline-variant/20 rounded-lg shadow-xl z-50 max-h-[480px] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10">
            <h3 className="text-sm font-semibold text-on-surface">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-primary hover:text-primary/80 transition-colors"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-on-surface-variant/50 text-sm">
                <span className="material-symbols-outlined text-3xl mb-2 block">
                  notifications_none
                </span>
                No notifications yet
              </div>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`w-full text-left px-4 py-3 border-b border-outline-variant/5 hover:bg-surface-container-high transition-colors flex gap-3 ${
                    !n.is_read ? "bg-primary/5" : ""
                  }`}
                >
                  <span className="material-symbols-outlined text-on-surface-variant/60 text-lg mt-0.5">
                    {TYPE_ICON[n.type] ?? "info"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-on-surface truncate">
                        {n.title}
                      </span>
                      {!n.is_read && (
                        <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-on-surface-variant/60 mt-0.5 line-clamp-2">
                      {n.body}
                    </p>
                    <span className="text-[10px] text-on-surface-variant/40 mt-1 block">
                      {timeAgo(n.created_at)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
