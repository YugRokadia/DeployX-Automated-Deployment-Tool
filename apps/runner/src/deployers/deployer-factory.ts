import type { DeployTarget, DeploymentStrategy } from "@deployx/shared";
import type { DeployerDriver } from "./deployer-interface";
import { DockerLocalDeployer } from "./docker-local-deployer";
import { DockerLocalCanaryDeployer } from "./docker-local-canary-deployer";
import { DockerLocalRollingDeployer } from "./docker-local-rolling-deployer";
import { RailwayDeployer } from "./railway-deployer";
import { FlyDeployer } from "./fly-deployer";

export function createDeployer(
  target: DeployTarget,
  strategy: DeploymentStrategy = "blue_green",
): DeployerDriver {
  switch (target) {
    case "docker_local":
      return createDockerLocalDeployer(strategy);
    case "railway":
      return createExternalDeployer("Railway", strategy, () => new RailwayDeployer());
    case "fly_io":
      return createExternalDeployer("Fly.io", strategy, () => new FlyDeployer());
    default:
      throw new Error(`Unknown deploy target: ${target}`);
  }
}

function createDockerLocalDeployer(
  strategy: DeploymentStrategy,
): DeployerDriver {
  switch (strategy) {
    case "blue_green":
      return new DockerLocalDeployer();
    case "canary":
      return new DockerLocalCanaryDeployer();
    case "rolling":
      return new DockerLocalRollingDeployer();
    default:
      throw new Error(`Unknown deployment strategy: ${strategy}`);
  }
}

function createExternalDeployer(
  name: string,
  strategy: DeploymentStrategy,
  factory: () => DeployerDriver,
): DeployerDriver {
  if (strategy !== "blue_green") {
    throw new Error(
      `${name} deployer only supports blue_green strategy, got: ${strategy}`,
    );
  }
  return factory();
}
