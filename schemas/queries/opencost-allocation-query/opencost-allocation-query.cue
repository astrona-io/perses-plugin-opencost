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

package model

import (
	"strings"
	ds "github.com/astrona-io/perses-plugin-opencost/schemas/datasources/opencost-datasource:model"
)

kind: "OpenCostAllocationQuery"
spec: close({
	ds.#selector

	// Outermost first: cluster, node, namespace, controllerKind, controller, service, pod, container,
	// label:<name>, annotation:<name>, or a variable such as ${dims:csv}.
	aggregate: [strings.MinRunes(1), ...strings.MinRunes(1)]
	costType?: "totalCost" | "cpuCost" | "ramCost" | "pvCost" | "networkCost" | "gpuCost" | "efficiency"
	idle?:     "include" | "exclude" | "share"
	sharedNamespaces?: [...strings.MinRunes(1)]
	// key:value, or a variable.
	sharedLabels?: [...(=~"^[^:]+:.+$" | =~"\\$")]
	shareSplit?: "even" | "weighted"
	accumulate?: bool
	// 1h, 6h, 1d, 1w, or a variable.
	step?:            =~"^([0-9]+[mhdw]|.*\\$.*)$"
	timeZone?:        strings.MinRunes(1)
	filter?:          string
	fractionOfTotal?: bool
	idleOnly?:        bool
})
