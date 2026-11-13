// Copyright The Perses Authors
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/** Properties OpenCost can aggregate by, besides `label:<name>` and `annotation:<name>`. */
export const AGGREGATE_PROPERTIES = [
  "cluster",
  "node",
  "namespace",
  "controllerKind",
  "controller",
  "service",
  "pod",
  "container",
] as const;

const PREFIXED_RE = /^(label|annotation):(.+)$/;

/** Throws when an aggregate is not one OpenCost understands. Variables must be replaced first. */
export function validateAggregate(aggregate: string): void {
  if ((AGGREGATE_PROPERTIES as readonly string[]).includes(aggregate)) return;
  const match = PREFIXED_RE.exec(aggregate);
  if (match && /^[A-Za-z0-9_.\-/]+$/.test(match[2]!)) return;
  throw new Error(
    `Unknown aggregate "${aggregate}": use one of ${AGGREGATE_PROPERTIES.join(", ")}, label:<name> or annotation:<name>`,
  );
}

/** The series label a dimension is written to: `label:team` becomes `team`, `namespace` stays `namespace`. */
export function labelNameFor(aggregate: string): string {
  const match = PREFIXED_RE.exec(aggregate);
  return match ? match[2]! : aggregate;
}

/** Splits `label:team` into its key, or returns undefined for a plain property. */
export function labelKey(aggregate: string): string | undefined {
  const match = /^label:(.+)$/.exec(aggregate);
  return match ? match[1] : undefined;
}

/** Splits `key:value` (shared label). */
export function parseSharedLabel(sharedLabel: string): {
  key: string;
  value: string;
} {
  const index = sharedLabel.indexOf(":");
  if (index <= 0 || index === sharedLabel.length - 1) {
    throw new Error(
      `Invalid shared label "${sharedLabel}": use key:value, e.g. team:platform`,
    );
  }
  return {
    key: sharedLabel.slice(0, index).trim(),
    value: sharedLabel.slice(index + 1).trim(),
  };
}
