import { describe, it, expect } from "vitest";
import {
  MarkNotificationReadSchema,
  NotificationQuerySchema,
} from "../notification";

describe("MarkNotificationReadSchema", () => {
  it("parses valid input with 3 UUIDs", () => {
    const input = {
      notification_ids: [
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
        "00000000-0000-0000-0000-000000000003",
      ],
    };

    const result = MarkNotificationReadSchema.parse(input);

    expect(result.notification_ids).toHaveLength(3);
    expect(result.notification_ids).toEqual(input.notification_ids);
  });

  it("rejects empty array", () => {
    const result = MarkNotificationReadSchema.safeParse({
      notification_ids: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects array with more than 50 items", () => {
    const ids = Array.from(
      { length: 51 },
      (_, i) =>
        `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    );

    const result = MarkNotificationReadSchema.safeParse({
      notification_ids: ids,
    });

    expect(result.success).toBe(false);
  });
});

describe("NotificationQuerySchema", () => {
  it("applies defaults when no fields provided", () => {
    const result = NotificationQuerySchema.parse({});

    expect(result.unread_only).toBe(false);
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });
});
