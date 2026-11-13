import type { TimeSeriesQueryPlugin } from '@perses-dev/plugin-system';
import { parseVariables } from '@perses-dev/plugin-system';

import { getTimeSeriesData } from './get-time-series-data';
import type { OpenCostAllocationQuerySpec } from './open-cost-allocation-query-types';
import { OpenCostAllocationQueryEditor } from './OpenCostAllocationQueryEditor';

export const OpenCostAllocationQuery: TimeSeriesQueryPlugin<OpenCostAllocationQuerySpec> = {
  getTimeSeriesData,
  OptionsEditorComponent: OpenCostAllocationQueryEditor,
  createInitialOptions: () => ({ query: '' }),
  dependsOn: (spec) => {
    const queryVariables = parseVariables(spec.query);
    const allVariables = [...new Set(queryVariables)];
    return {
      variables: allVariables,
    };
  },
};
