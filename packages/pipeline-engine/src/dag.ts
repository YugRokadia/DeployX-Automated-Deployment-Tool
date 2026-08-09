/**
 * DAG Resolver — Topological sort with parallel group computation.
 *
 * Uses Kahn's algorithm (BFS-based) which naturally produces parallel
 * execution groups: at each iteration, all nodes with in-degree 0
 * can run concurrently.
 */

export interface DAGResult {
  /** Tasks grouped by parallel execution level. Groups run sequentially; tasks within a group run in parallel. */
  readonly groups: readonly (readonly string[])[];
  /** Flat topological order (left-to-right within groups, groups in sequence). */
  readonly order: readonly string[];
}

export interface DAGInput {
  readonly depends_on?: readonly string[];
}

/**
 * Resolve a task dependency graph into parallel execution groups.
 * Throws on cycles or missing dependency references.
 */
export function resolveDAG(
  tasks: Readonly<Record<string, DAGInput>>,
): DAGResult {
  const errors = validateDAG(tasks);
  if (errors.length > 0) {
    throw new Error(`DAG validation failed:\n${errors.join("\n")}`);
  }

  const taskNames = Object.keys(tasks);

  if (taskNames.length === 0) {
    return { groups: [], order: [] };
  }

  // Build in-degree map and adjacency list
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const name of taskNames) {
    inDegree.set(name, 0);
    dependents.set(name, []);
  }

  for (const name of taskNames) {
    const deps = tasks[name].depends_on ?? [];
    inDegree.set(name, deps.length);
    for (const dep of deps) {
      dependents.get(dep)!.push(name);
    }
  }

  // Kahn's algorithm with parallel grouping
  const groups: string[][] = [];
  const order: string[] = [];

  // Seed with all zero in-degree nodes
  let currentGroup = taskNames.filter((name) => inDegree.get(name) === 0);

  while (currentGroup.length > 0) {
    // Sort within group for deterministic output
    const sortedGroup = [...currentGroup].sort();
    groups.push(sortedGroup);
    order.push(...sortedGroup);

    const nextGroup: string[] = [];

    for (const name of sortedGroup) {
      for (const dependent of dependents.get(name)!) {
        const newDegree = inDegree.get(dependent)! - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) {
          nextGroup.push(dependent);
        }
      }
    }

    currentGroup = nextGroup;
  }

  // If we didn't process all nodes, there's a cycle
  // (This shouldn't happen since validateDAG checks for cycles,
  //  but kept as a safety net)
  if (order.length !== taskNames.length) {
    const remaining = taskNames.filter((n) => !order.includes(n));
    throw new Error(
      `Cycle detected among tasks: ${remaining.join(", ")}`,
    );
  }

  return { groups, order };
}

/**
 * Validate a DAG without resolving it. Returns an array of error
 * messages (empty array means valid).
 */
export function validateDAG(
  tasks: Readonly<Record<string, DAGInput>>,
): readonly string[] {
  const errors: string[] = [];
  const taskNames = new Set(Object.keys(tasks));

  // Check for missing dependency references
  for (const [name, task] of Object.entries(tasks)) {
    for (const dep of task.depends_on ?? []) {
      if (!taskNames.has(dep)) {
        errors.push(
          `Task "${name}" depends on "${dep}" which does not exist`,
        );
      }
      if (dep === name) {
        errors.push(`Task "${name}" depends on itself`);
      }
    }
  }

  // Don't check for cycles if there are already reference errors
  if (errors.length > 0) {
    return errors;
  }

  // Cycle detection using Kahn's algorithm
  const inDegree = new Map<string, number>();
  for (const name of taskNames) {
    inDegree.set(name, (tasks[name].depends_on ?? []).length);
  }

  const queue = [...taskNames].filter((name) => inDegree.get(name) === 0);
  let processed = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    processed++;

    for (const [name, task] of Object.entries(tasks)) {
      if ((task.depends_on ?? []).includes(current)) {
        const newDegree = inDegree.get(name)! - 1;
        inDegree.set(name, newDegree);
        if (newDegree === 0) {
          queue.push(name);
        }
      }
    }
  }

  if (processed !== taskNames.size) {
    const cycleNodes = [...taskNames].filter(
      (name) => inDegree.get(name)! > 0,
    );
    errors.push(
      `Cycle detected among tasks: ${cycleNodes.join(", ")}`,
    );
  }

  return errors;
}
