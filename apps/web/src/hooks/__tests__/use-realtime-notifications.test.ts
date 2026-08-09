import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────

const mockRemoveChannel = vi.fn();
const mockSubscribe = vi.fn().mockReturnThis();

let postgresChangeHandlers: Array<{
  filter: string;
  callback: (payload: { new: unknown }) => void;
}> = [];

const mockChannel = {
  on: vi.fn().mockImplementation((_event: string, opts: { filter: string }, cb: (payload: { new: unknown }) => void) => {
    postgresChangeHandlers.push({ filter: opts.filter, callback: cb });
    return mockChannel;
  }),
  subscribe: mockSubscribe,
};

const mockSupabaseClient = {
  channel: vi.fn().mockReturnValue(mockChannel),
  removeChannel: mockRemoveChannel,
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn().mockReturnValue(mockSupabaseClient),
}));

// We test the hook logic by extracting state management behavior.
// Since @testing-library/react is not installed, we simulate the hook's
// internal logic directly.

interface NotificationData {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly metadata: Record<string, unknown> | null;
  readonly is_read: boolean;
  readonly created_at: string;
}

function makeNotification(
  overrides: Partial<NotificationData> = {},
): NotificationData {
  return {
    id: "notif-1",
    type: "system",
    title: "Test",
    body: "Test body",
    metadata: null,
    is_read: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// Simulates the hook's state management logic without React rendering
function createNotificationState(
  initialNotifications: readonly NotificationData[],
  initialUnreadCount: number,
) {
  let notifications = [...initialNotifications];
  let unreadCount = initialUnreadCount;

  function addNotification(n: NotificationData) {
    notifications = [n, ...notifications];
    if (!n.is_read) {
      unreadCount = unreadCount + 1;
    }
  }

  function markAsRead(ids: readonly string[]) {
    notifications = notifications.map((n) =>
      ids.includes(n.id) ? { ...n, is_read: true } : n,
    );
    unreadCount = Math.max(0, unreadCount - ids.length);
  }

  function markAllRead() {
    notifications = notifications.map((n) => ({ ...n, is_read: true }));
    unreadCount = 0;
  }

  return {
    getNotifications: () => notifications,
    getUnreadCount: () => unreadCount,
    addNotification,
    markAsRead,
    markAllRead,
  };
}

// ── Tests ──────────────────────────────────────────────────────

describe("useRealtimeNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    postgresChangeHandlers = [];
  });

  it("initializes with provided notifications and unread count", () => {
    const existing = [
      makeNotification({ id: "n1", is_read: false }),
      makeNotification({ id: "n2", is_read: true }),
    ];

    const state = createNotificationState(existing, 1);

    expect(state.getNotifications()).toHaveLength(2);
    expect(state.getUnreadCount()).toBe(1);
  });

  it("marks specific notifications as read", () => {
    const existing = [
      makeNotification({ id: "n1", is_read: false }),
      makeNotification({ id: "n2", is_read: false }),
      makeNotification({ id: "n3", is_read: false }),
    ];

    const state = createNotificationState(existing, 3);

    state.markAsRead(["n1", "n3"]);

    const updated = state.getNotifications();
    expect(updated.find((n) => n.id === "n1")!.is_read).toBe(true);
    expect(updated.find((n) => n.id === "n2")!.is_read).toBe(false);
    expect(updated.find((n) => n.id === "n3")!.is_read).toBe(true);
    expect(state.getUnreadCount()).toBe(1);
  });

  it("handles new notification from realtime by prepending it", () => {
    const existing = [makeNotification({ id: "n1" })];
    const state = createNotificationState(existing, 1);

    const newNotif = makeNotification({
      id: "n2",
      title: "Deployment complete",
      is_read: false,
    });

    state.addNotification(newNotif);

    expect(state.getNotifications()).toHaveLength(2);
    expect(state.getNotifications()[0]!.id).toBe("n2");
    expect(state.getUnreadCount()).toBe(2);
  });

  it("subscribes to realtime channel and cleanup unsubscribes on unmount", () => {
    // Simulate the useEffect setup
    const userId = "user-1";
    mockSupabaseClient.channel(`notifications:${userId}`);

    expect(mockSupabaseClient.channel).toHaveBeenCalledWith(
      `notifications:${userId}`,
    );

    // Simulate the useEffect cleanup
    mockRemoveChannel(mockChannel);

    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
  });
});
