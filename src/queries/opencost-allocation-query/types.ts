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

import type { DatasourceSelectValue } from "@perses-dev/plugin-system";
import type { DatasourceSelector } from "@perses-dev/spec";

import type { CostType, ShareSplit } from "../../model/transform";

export type IdleMode = "include" | "exclude" | "share";

export interface OpenCostAllocationQuerySpec {
  datasource?: DatasourceSelectValue<DatasourceSelector>;
  /** Dimensions, outermost first: namespace, controller, pod, container, node, label:<name>, annotation:<name>. */
  aggregate: string[];
  /** Default totalCost. */
  costType?: CostType;
  /** Default exclude. */
  idle?: IdleMode;
  /** Namespaces whose cost is spread over the other series (e.g. kube-system). */
  sharedNamespaces?: string[];
  /** `key:value` labels whose cost is spread over the other series. */
  sharedLabels?: string[];
  /** How shared cost is spread: evenly, or weighted by each series' own total cost (default). */
  shareSplit?: ShareSplit;
  /** One point per series for the whole range instead of one per step. Default false. */
  accumulate?: boolean;
  /** Step override (`1h`, `6h`, `1d`, `1w`). Default: picked from the range. */
  step?: string;
  /** IANA time zone that day and week steps start at midnight in. Default UTC. */
  timeZone?: string;
  /** OpenCost filter, e.g. `namespace:"api","web"`. */
  filter?: string;
  /** Write each value as its share (0 to 1) of all series at that time. */
  fractionOfTotal?: boolean;
  /** Keep only the idle series (needs idle: include). */
  idleOnly?: boolean;
}

export const DEFAULT_COST_TYPE: CostType = "totalCost";
export const DEFAULT_IDLE: IdleMode = "exclude";
export const DEFAULT_SHARE_SPLIT: ShareSplit = "weighted";
