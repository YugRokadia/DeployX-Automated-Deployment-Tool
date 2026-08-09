import { describe, it, expect } from "vitest";
import { UpdateProfileSchema } from "../profile";

describe("UpdateProfileSchema", () => {
  it("parses valid update with display_name", () => {
    const result = UpdateProfileSchema.parse({
      display_name: "Jane Doe",
    });

    expect(result.display_name).toBe("Jane Doe");
  });

  it("rejects empty display_name", () => {
    const result = UpdateProfileSchema.safeParse({
      display_name: "",
    });

    expect(result.success).toBe(false);
  });

  it("rejects display_name over 100 characters", () => {
    const result = UpdateProfileSchema.safeParse({
      display_name: "x".repeat(101),
    });

    expect(result.success).toBe(false);
  });

  it("accepts empty string to clear avatar_url but rejects invalid URL", () => {
    const clearResult = UpdateProfileSchema.safeParse({
      avatar_url: "",
    });
    expect(clearResult.success).toBe(true);

    const invalidResult = UpdateProfileSchema.safeParse({
      avatar_url: "not-a-url",
    });
    expect(invalidResult.success).toBe(false);
  });
});
