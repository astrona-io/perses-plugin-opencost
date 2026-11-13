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

import { fireEvent, render, screen } from "@testing-library/react";

import { OpenCostAllocationQueryEditor } from "./OpenCostAllocationQueryEditor";

jest.mock("@perses-dev/plugin-system", () => ({
  ...jest.requireActual("@perses-dev/plugin-system"),
  DatasourceSelect: () => <div>datasource select</div>,
}));

describe("OpenCostAllocationQueryEditor", () => {
  it("has a labelled control for every option", () => {
    render(
      <OpenCostAllocationQueryEditor
        value={{ aggregate: ["namespace"] }}
        onChange={jest.fn()}
      />,
    );
    for (const label of [
      "Aggregate by",
      "Cost type",
      "Idle cost",
      "Shared namespaces",
      "Shared labels",
      "Split shared cost",
      "Filter",
      "Step",
      "Time zone",
      "Accumulate (one point for the range)",
      "Share of total (0 to 1)",
      "Idle series only",
    ]) {
      expect(
        screen.getAllByLabelText(label, { exact: false }).length,
      ).toBeGreaterThan(0);
    }
  });

  it("commits the filter on blur, not per keystroke", () => {
    const onChange = jest.fn();
    render(
      <OpenCostAllocationQueryEditor
        value={{ aggregate: ["namespace"] }}
        onChange={onChange}
      />,
    );
    const filter = screen.getByLabelText("Filter");
    fireEvent.change(filter, { target: { value: 'namespace:"api"' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(filter);
    expect(onChange).toHaveBeenCalledWith({
      aggregate: ["namespace"],
      filter: 'namespace:"api"',
    });
  });

  it("drops options that are switched back to their default", () => {
    const onChange = jest.fn();
    render(
      <OpenCostAllocationQueryEditor
        value={{ aggregate: ["namespace"], accumulate: true }}
        onChange={onChange}
      />,
    );
    fireEvent.click(
      screen.getByLabelText("Accumulate (one point for the range)"),
    );
    expect(onChange).toHaveBeenCalledWith({ aggregate: ["namespace"] });
  });
});
