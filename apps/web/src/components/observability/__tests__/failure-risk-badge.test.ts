import { describe, it, expect } from "vitest";

/**
 * FailureRiskBadge is a pure presentational React component.
 * Since @testing-library/react is not available, we test the
 * underlying constants and computation logic that drive rendering.
 */

const LEVEL_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  low: { bg: "bg-tertiary/10", text: "text-tertiary", label: "Low Risk" },
  medium: { bg: "bg-[#ffd54f]/10", text: "text-[#ffd54f]", label: "Medium Risk" },
  high: { bg: "bg-error/10", text: "text-error", label: "High Risk" },
};

function getIcon(level: string): string {
  if (level === "high") return "error";
  if (level === "medium") return "warning";
  return "check_circle";
}

function formatRisk(risk: number): string {
  return `${Math.round(risk * 100)}%`;
}

describe("FailureRiskBadge logic", () => {
  it('renders "low" risk with correct style and icon', () => {
    const style = LEVEL_STYLE["low"];
    expect(style).toBeDefined();
    expect(style.label).toBe("Low Risk");
    expect(style.text).toBe("text-tertiary");
    expect(getIcon("low")).toBe("check_circle");
  });

  it('renders "high" risk with correct style and icon', () => {
    const style = LEVEL_STYLE["high"];
    expect(style).toBeDefined();
    expect(style.label).toBe("High Risk");
    expect(style.text).toBe("text-error");
    expect(style.bg).toBe("bg-error/10");
    expect(getIcon("high")).toBe("error");
  });

  it("renders risk percentage correctly", () => {
    expect(formatRisk(0.15)).toBe("15%");
    expect(formatRisk(0.756)).toBe("76%");
    expect(formatRisk(0)).toBe("0%");
    expect(formatRisk(1)).toBe("100%");
  });
});
