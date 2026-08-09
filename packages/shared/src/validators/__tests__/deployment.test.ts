import { describe, it, expect } from "vitest";
import {
  DeployConfigSchema,
  HealthCheckConfigSchema,
  CreateDeploymentSchema,
  RecordHealthCheckSchema,
  RecordHealingEventSchema,
  CanaryConfigSchema,
  RollingConfigSchema,
  RailwayConfigSchema,
  FlyConfigSchema,
} from "../deployment";

describe("HealthCheckConfigSchema", () => {
  it("parses valid config with all fields", () => {
    const input = {
      path: "/healthz",
      interval_seconds: 15,
      timeout_seconds: 10,
      retries: 5,
      start_period_seconds: 30,
    };

    const result = HealthCheckConfigSchema.parse(input);

    expect(result).toEqual(input);
  });

  it("applies defaults for missing fields", () => {
    const result = HealthCheckConfigSchema.parse({});

    expect(result.path).toBe("/health");
    expect(result.interval_seconds).toBe(10);
    expect(result.timeout_seconds).toBe(5);
    expect(result.retries).toBe(3);
    expect(result.start_period_seconds).toBe(15);
  });

  it("rejects empty path", () => {
    const result = HealthCheckConfigSchema.safeParse({ path: "" });

    expect(result.success).toBe(false);
  });

  it("rejects negative retries", () => {
    const result = HealthCheckConfigSchema.safeParse({ retries: -1 });

    expect(result.success).toBe(false);
  });

  it("rejects interval exceeding max", () => {
    const result = HealthCheckConfigSchema.safeParse({ interval_seconds: 301 });

    expect(result.success).toBe(false);
  });
});

describe("DeployConfigSchema", () => {
  it("parses valid config with all fields", () => {
    const input = {
      driver: "docker_local",
      strategy: "canary",
      port: 8080,
      image: "my-app:v1",
      health_check: { path: "/healthz" },
      env: { NODE_ENV: "production" },
    };

    const result = DeployConfigSchema.parse(input);

    expect(result.driver).toBe("docker_local");
    expect(result.strategy).toBe("canary");
    expect(result.port).toBe(8080);
    expect(result.image).toBe("my-app:v1");
    expect(result.env).toEqual({ NODE_ENV: "production" });
  });

  it("applies default strategy of blue_green", () => {
    const result = DeployConfigSchema.parse({ driver: "docker_local" });

    expect(result.strategy).toBe("blue_green");
  });

  it("applies default port of 3000", () => {
    const result = DeployConfigSchema.parse({ driver: "docker_local" });

    expect(result.port).toBe(3000);
  });

  it("accepts railway driver", () => {
    const result = DeployConfigSchema.parse({ driver: "railway" });

    expect(result.driver).toBe("railway");
  });

  it("accepts fly_io driver", () => {
    const result = DeployConfigSchema.parse({ driver: "fly_io" });

    expect(result.driver).toBe("fly_io");
  });

  it("rejects invalid driver", () => {
    const result = DeployConfigSchema.safeParse({ driver: "kubernetes" });

    expect(result.success).toBe(false);
  });

  it("rejects invalid strategy", () => {
    const result = DeployConfigSchema.safeParse({
      driver: "docker_local",
      strategy: "recreate",
    });

    expect(result.success).toBe(false);
  });

  it("rejects port exceeding 65535", () => {
    const result = DeployConfigSchema.safeParse({
      driver: "docker_local",
      port: 70000,
    });

    expect(result.success).toBe(false);
  });

  it("rejects negative port", () => {
    const result = DeployConfigSchema.safeParse({
      driver: "docker_local",
      port: -1,
    });

    expect(result.success).toBe(false);
  });

  it("optional fields are undefined when not provided", () => {
    const result = DeployConfigSchema.parse({ driver: "docker_local" });

    expect(result.image).toBeUndefined();
    expect(result.health_check).toBeUndefined();
    expect(result.env).toBeUndefined();
  });
});

describe("CreateDeploymentSchema", () => {
  it("parses valid input", () => {
    const input = {
      strategy: "blue_green",
      deploy_target: "docker_local",
      image_tag: "my-app:abc1234",
      image_digest: "sha256:abcdef1234567890",
    };

    const result = CreateDeploymentSchema.parse(input);

    expect(result).toEqual(input);
  });

  it("accepts input without optional image_digest", () => {
    const input = {
      strategy: "canary",
      deploy_target: "railway",
      image_tag: "my-app:latest",
    };

    const result = CreateDeploymentSchema.parse(input);

    expect(result.image_digest).toBeUndefined();
  });

  it("rejects missing strategy", () => {
    const result = CreateDeploymentSchema.safeParse({
      deploy_target: "docker_local",
      image_tag: "my-app:latest",
    });

    expect(result.success).toBe(false);
  });

  it("rejects empty image_tag", () => {
    const result = CreateDeploymentSchema.safeParse({
      strategy: "blue_green",
      deploy_target: "docker_local",
      image_tag: "",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid deploy_target", () => {
    const result = CreateDeploymentSchema.safeParse({
      strategy: "blue_green",
      deploy_target: "aws_ecs",
      image_tag: "my-app:latest",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid strategy value", () => {
    const result = CreateDeploymentSchema.safeParse({
      strategy: "recreate",
      deploy_target: "docker_local",
      image_tag: "my-app:latest",
    });

    expect(result.success).toBe(false);
  });
});

describe("RecordHealthCheckSchema", () => {
  it("parses valid pass record", () => {
    const input = {
      status: "pass",
      response_time_ms: 42,
      status_code: 200,
    };

    const result = RecordHealthCheckSchema.parse(input);

    expect(result).toEqual(input);
  });

  it("parses valid fail record with error message", () => {
    const input = {
      status: "fail",
      response_time_ms: 5000,
      status_code: 500,
      error_message: "Internal Server Error",
    };

    const result = RecordHealthCheckSchema.parse(input);

    expect(result).toEqual(input);
  });

  it("accepts minimal input with only status", () => {
    const result = RecordHealthCheckSchema.parse({ status: "pass" });

    expect(result.status).toBe("pass");
    expect(result.response_time_ms).toBeUndefined();
    expect(result.status_code).toBeUndefined();
    expect(result.error_message).toBeUndefined();
  });

  it("rejects invalid status", () => {
    const result = RecordHealthCheckSchema.safeParse({ status: "unknown" });

    expect(result.success).toBe(false);
  });

  it("rejects missing status", () => {
    const result = RecordHealthCheckSchema.safeParse({
      response_time_ms: 42,
    });

    expect(result.success).toBe(false);
  });

  it("rejects negative response_time_ms", () => {
    const result = RecordHealthCheckSchema.safeParse({
      status: "pass",
      response_time_ms: -1,
    });

    expect(result.success).toBe(false);
  });

  it("rejects error_message exceeding max length", () => {
    const result = RecordHealthCheckSchema.safeParse({
      status: "fail",
      error_message: "x".repeat(4097),
    });

    expect(result.success).toBe(false);
  });
});

describe("RecordHealingEventSchema", () => {
  it("parses valid healing event with all fields", () => {
    const input = {
      event_type: "restart_started",
      attempt_number: 1,
      container_name: "deployx-myapp-blue",
      details: { error: "timeout" },
    };

    const result = RecordHealingEventSchema.parse(input);

    expect(result).toEqual(input);
  });

  it("parses valid event with only required fields", () => {
    const result = RecordHealingEventSchema.parse({
      event_type: "health_degraded",
    });

    expect(result.event_type).toBe("health_degraded");
    expect(result.attempt_number).toBeUndefined();
    expect(result.container_name).toBeUndefined();
    expect(result.details).toBeUndefined();
  });

  it("accepts all valid event types", () => {
    const validTypes = [
      "health_degraded",
      "health_unhealthy",
      "restart_started",
      "restart_succeeded",
      "restart_failed",
      "rollback_started",
      "rollback_succeeded",
      "rollback_failed",
      "canary_promotion",
      "canary_rollback",
      "rolling_instance_updated",
      "rolling_rollback",
    ];

    for (const eventType of validTypes) {
      const result = RecordHealingEventSchema.safeParse({
        event_type: eventType,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid event type", () => {
    const result = RecordHealingEventSchema.safeParse({
      event_type: "invalid_type",
    });

    expect(result.success).toBe(false);
  });

  it("rejects negative attempt_number", () => {
    const result = RecordHealingEventSchema.safeParse({
      event_type: "restart_started",
      attempt_number: -1,
    });

    expect(result.success).toBe(false);
  });

  it("rejects container_name exceeding max length", () => {
    const result = RecordHealingEventSchema.safeParse({
      event_type: "restart_started",
      container_name: "x".repeat(257),
    });

    expect(result.success).toBe(false);
  });

  it("accepts attempt_number of 0", () => {
    const result = RecordHealingEventSchema.safeParse({
      event_type: "restart_started",
      attempt_number: 0,
    });

    expect(result.success).toBe(true);
  });

  it("accepts details with nested values", () => {
    const result = RecordHealingEventSchema.safeParse({
      event_type: "rollback_started",
      details: {
        from_image: "myapp:v2",
        to_image: "myapp:v1",
        reason: "persistent health check failure",
      },
    });

    expect(result.success).toBe(true);
  });
});

describe("CanaryConfigSchema", () => {
  it("applies defaults when no fields provided", () => {
    const result = CanaryConfigSchema.parse({});

    expect(result.stages).toEqual([10, 25, 50, 100]);
    expect(result.observation_seconds).toBe(30);
  });

  it("parses valid custom config", () => {
    const input = {
      stages: [5, 20, 50, 80, 100],
      observation_seconds: 60,
    };

    const result = CanaryConfigSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("rejects stages outside 1-100 range", () => {
    expect(
      CanaryConfigSchema.safeParse({ stages: [0, 50, 100] }).success,
    ).toBe(false);
    expect(
      CanaryConfigSchema.safeParse({ stages: [10, 101] }).success,
    ).toBe(false);
  });

  it("rejects empty stages array", () => {
    expect(
      CanaryConfigSchema.safeParse({ stages: [] }).success,
    ).toBe(false);
  });

  it("rejects more than 10 stages", () => {
    const stages = Array.from({ length: 11 }, (_, i) => (i + 1) * 9);
    expect(
      CanaryConfigSchema.safeParse({ stages }).success,
    ).toBe(false);
  });

  it("rejects observation_seconds exceeding max", () => {
    expect(
      CanaryConfigSchema.safeParse({ observation_seconds: 601 }).success,
    ).toBe(false);
  });
});

describe("RollingConfigSchema", () => {
  it("applies defaults when no fields provided", () => {
    const result = RollingConfigSchema.parse({});

    expect(result.instances).toBe(2);
    expect(result.max_unavailable).toBe(1);
    expect(result.observation_seconds).toBe(15);
  });

  it("parses valid custom config", () => {
    const input = {
      instances: 5,
      max_unavailable: 2,
      observation_seconds: 45,
    };

    const result = RollingConfigSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("rejects instances below minimum of 2", () => {
    expect(
      RollingConfigSchema.safeParse({ instances: 1 }).success,
    ).toBe(false);
  });

  it("rejects instances above maximum of 10", () => {
    expect(
      RollingConfigSchema.safeParse({ instances: 11 }).success,
    ).toBe(false);
  });

  it("rejects max_unavailable above maximum of 5", () => {
    expect(
      RollingConfigSchema.safeParse({ max_unavailable: 6 }).success,
    ).toBe(false);
  });

  it("rejects observation_seconds exceeding max", () => {
    expect(
      RollingConfigSchema.safeParse({ observation_seconds: 601 }).success,
    ).toBe(false);
  });
});

describe("DeployConfigSchema with strategy sub-configs", () => {
  it("parses canary strategy with canary config", () => {
    const result = DeployConfigSchema.parse({
      driver: "docker_local",
      strategy: "canary",
      canary: {
        stages: [10, 50, 100],
        observation_seconds: 45,
      },
    });

    expect(result.strategy).toBe("canary");
    expect(result.canary?.stages).toEqual([10, 50, 100]);
    expect(result.canary?.observation_seconds).toBe(45);
  });

  it("parses rolling strategy with rolling config", () => {
    const result = DeployConfigSchema.parse({
      driver: "docker_local",
      strategy: "rolling",
      rolling: {
        instances: 4,
        max_unavailable: 2,
        observation_seconds: 30,
      },
    });

    expect(result.strategy).toBe("rolling");
    expect(result.rolling?.instances).toBe(4);
    expect(result.rolling?.max_unavailable).toBe(2);
  });

  it("allows strategy without sub-config (uses defaults when accessed)", () => {
    const result = DeployConfigSchema.parse({
      driver: "docker_local",
      strategy: "canary",
    });

    expect(result.strategy).toBe("canary");
    expect(result.canary).toBeUndefined();
  });

  it("parses railway driver with railway config", () => {
    const result = DeployConfigSchema.parse({
      driver: "railway",
      railway: {
        project_id: "proj-123",
        region: "us-west1",
      },
    });

    expect(result.driver).toBe("railway");
    expect(result.railway?.project_id).toBe("proj-123");
    expect(result.railway?.region).toBe("us-west1");
  });

  it("parses fly_io driver with fly config", () => {
    const result = DeployConfigSchema.parse({
      driver: "fly_io",
      fly: {
        app_name: "my-fly-app",
        region: "lax",
        vm_size: "performance-1x",
      },
    });

    expect(result.driver).toBe("fly_io");
    expect(result.fly?.app_name).toBe("my-fly-app");
    expect(result.fly?.vm_size).toBe("performance-1x");
  });
});

describe("RailwayConfigSchema", () => {
  it("parses valid config with all fields", () => {
    const result = RailwayConfigSchema.parse({
      project_id: "proj-abc",
      region: "us-west1",
    });

    expect(result.project_id).toBe("proj-abc");
    expect(result.region).toBe("us-west1");
  });

  it("allows empty config (all fields optional)", () => {
    const result = RailwayConfigSchema.parse({});

    expect(result.project_id).toBeUndefined();
    expect(result.region).toBeUndefined();
  });

  it("rejects project_id exceeding max length", () => {
    expect(
      RailwayConfigSchema.safeParse({ project_id: "x".repeat(257) }).success,
    ).toBe(false);
  });
});

describe("FlyConfigSchema", () => {
  it("applies defaults when no fields provided", () => {
    const result = FlyConfigSchema.parse({});

    expect(result.app_name).toBeUndefined();
    expect(result.region).toBe("iad");
    expect(result.vm_size).toBe("shared-cpu-1x");
  });

  it("parses valid custom config", () => {
    const input = {
      app_name: "my-app",
      region: "lax",
      vm_size: "performance-2x" as const,
    };

    const result = FlyConfigSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("rejects invalid vm_size", () => {
    expect(
      FlyConfigSchema.safeParse({ vm_size: "mega-cpu" }).success,
    ).toBe(false);
  });

  it("accepts all valid vm_size values", () => {
    const validSizes = [
      "shared-cpu-1x",
      "shared-cpu-2x",
      "shared-cpu-4x",
      "performance-1x",
      "performance-2x",
    ];

    for (const size of validSizes) {
      const result = FlyConfigSchema.safeParse({ vm_size: size });
      expect(result.success).toBe(true);
    }
  });
});
