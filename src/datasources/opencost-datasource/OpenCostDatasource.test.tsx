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

import { OpenCostDatasource } from "./OpenCostDatasource";
import { OpenCostDatasourceEditor } from "./OpenCostDatasourceEditor";

jest.mock("@perses-dev/plugin-system", () => ({
  ...jest.requireActual("@perses-dev/plugin-system"),
  HTTPSettingsEditor: () => <div>http settings</div>,
}));

describe("OpenCostDatasourceEditor", () => {
  it("stores the currency as an upper-case code and removes it when cleared", () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <OpenCostDatasourceEditor
        value={{ directUrl: "http://oc:9003" }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Currency"), {
      target: { value: "eur" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      directUrl: "http://oc:9003",
      currency: "EUR",
    });

    rerender(
      <OpenCostDatasourceEditor
        value={{ directUrl: "http://oc:9003", currency: "EUR" }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Currency"), {
      target: { value: "" },
    });
    expect(onChange).toHaveBeenLastCalledWith({ directUrl: "http://oc:9003" });
  });
});

describe("OpenCostDatasource.createClient", () => {
  it("prefers directUrl, falls back to the proxy URL, and fails without either", () => {
    expect(
      OpenCostDatasource.createClient({ directUrl: "http://oc:9003" }, {})
        .options.datasourceUrl,
    ).toBe("http://oc:9003");
    expect(
      OpenCostDatasource.createClient(
        { currency: "USD" },
        { proxyUrl: "/proxy/x" },
      ).options,
    ).toEqual({
      datasourceUrl: "/proxy/x",
      currency: "USD",
    });
    expect(() => OpenCostDatasource.createClient({}, {})).toThrow(/No URL/);
  });
});
