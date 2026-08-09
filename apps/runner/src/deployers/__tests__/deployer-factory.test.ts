import { describe, it, expect } from "vitest";
import { createDeployer } from "../deployer-factory";
import { DockerLocalDeployer } from "../docker-local-deployer";
import { DockerLocalCanaryDeployer } from "../docker-local-canary-deployer";
import { DockerLocalRollingDeployer } from "../docker-local-rolling-deployer";
import { RailwayDeployer } from "../railway-deployer";
import { FlyDeployer } from "../fly-deployer";

describe("createDeployer", () => {
  it("returns DockerLocalDeployer for docker_local + blue_green", () => {
    const deployer = createDeployer("docker_local", "blue_green");
    expect(deployer).toBeInstanceOf(DockerLocalDeployer);
  });

  it("returns DockerLocalCanaryDeployer for docker_local + canary", () => {
    const deployer = createDeployer("docker_local", "canary");
    expect(deployer).toBeInstanceOf(DockerLocalCanaryDeployer);
  });

  it("returns DockerLocalRollingDeployer for docker_local + rolling", () => {
    const deployer = createDeployer("docker_local", "rolling");
    expect(deployer).toBeInstanceOf(DockerLocalRollingDeployer);
  });

  it("defaults to blue_green when strategy is not provided", () => {
    const deployer = createDeployer("docker_local");
    expect(deployer).toBeInstanceOf(DockerLocalDeployer);
  });

  it("returns RailwayDeployer for railway + blue_green", () => {
    const deployer = createDeployer("railway", "blue_green");
    expect(deployer).toBeInstanceOf(RailwayDeployer);
  });

  it("returns FlyDeployer for fly_io + blue_green", () => {
    const deployer = createDeployer("fly_io", "blue_green");
    expect(deployer).toBeInstanceOf(FlyDeployer);
  });

  it("throws for railway + canary", () => {
    expect(() => createDeployer("railway", "canary")).toThrow(
      "Railway deployer only supports blue_green strategy",
    );
  });

  it("throws for railway + rolling", () => {
    expect(() => createDeployer("railway", "rolling")).toThrow(
      "Railway deployer only supports blue_green strategy",
    );
  });

  it("throws for fly_io + canary", () => {
    expect(() => createDeployer("fly_io", "canary")).toThrow(
      "Fly.io deployer only supports blue_green strategy",
    );
  });

  it("throws for fly_io + rolling", () => {
    expect(() => createDeployer("fly_io", "rolling")).toThrow(
      "Fly.io deployer only supports blue_green strategy",
    );
  });
});
