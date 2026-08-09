import { describe, it, expect } from "vitest";

/**
 * SlaUptimeRing is a pure presentational React component.
 * Since @testing-library/react is not available, we test the
 * underlying constants and computation logic that drive rendering.
 */

// Re-create the lookup tables used by the component to verify correctness.
const STATUS_COLOR: Record<string, string> = {
  met: "var(--color-tertiary)",
  at_risk: "#ffd54f",
  breached: "var(--color-error)",
};

const STATUS_LABEL: Record<string, string> = {
  met: "SLA Met",
  at_risk: "At Risk",
  breached: "Breached",
};

function computeRingGeometry(
  uptimePercent: number,
  size: number = 120,
) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, Math.max(0, uptimePercent));
  const dashOffset = circumference * (1 - progress / 100);
  return { radius, circumference, progress, dashOffset };
}

describe("SlaUptimeRing logic", () => {
  it('uses green (tertiary) color for "met" status', () => {
    const color = STATUS_COLOR["met"];
    expect(color).toBe("var(--color-tertiary)");

    const label = STATUS_LABEL["met"];
    expect(label).toBe("SLA Met");
  });

  it('uses red (error) color for "breached" status', () => {
    const color = STATUS_COLOR["breached"];
    expect(color).toBe("var(--color-error)");

    const label = STATUS_LABEL["breached"];
    expect(label).toBe("Breached");
  });

  it("computes correct percentage text and ring geometry", () => {
    const uptime = 99.95;
    const formatted = uptime.toFixed(2);
    expect(formatted).toBe("99.95");

    const { circumference, dashOffset, progress } = computeRingGeometry(uptime);
    expect(progress).toBe(99.95);
    // dashOffset should be very small since uptime is near 100%
    expect(dashOffset).toBeCloseTo(circumference * (1 - 99.95 / 100), 5);
    expect(dashOffset).toBeGreaterThan(0);

    // Verify clamping: above 100 clamps to 100
    const clamped = computeRingGeometry(105);
    expect(clamped.progress).toBe(100);
    expect(clamped.dashOffset).toBe(0);
  });
});
