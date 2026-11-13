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

import { keysToOptions } from "./OpenCostAggregateVariable";

describe("keysToOptions", () => {
  it("lists the keys of every set, sorted, without idle and unallocated", () => {
    const options = keysToOptions({
      code: 200,
      data: [
        { search: {} as never, __idle__: {} as never },
        { payments: {} as never, __unallocated__: {} as never },
        null,
      ],
    });
    expect(options).toEqual([
      { value: "payments", label: "payments" },
      { value: "search", label: "search" },
    ]);
  });

  it("returns nothing for an empty response", () => {
    expect(keysToOptions({ code: 200, data: null })).toEqual([]);
  });
});
