import type { DatasourceSelectProps, OptionsEditorProps } from '@perses-dev/plugin-system';
import { DatasourceSelect, isVariableDatasource } from '@perses-dev/plugin-system';
import type { ChangeEvent, ReactElement } from 'react';
import { useCallback } from 'react';

import { DATASOURCE_KIND, DEFAULT_DATASOURCE } from './constants';
import type { OpenCostAllocationQuerySpec } from './open-cost-allocation-query-types';

type OpenCostAllocationQueryEditorProps = OptionsEditorProps<OpenCostAllocationQuerySpec>;

export function OpenCostAllocationQueryEditor(props: OpenCostAllocationQueryEditorProps): ReactElement {
  const { onChange, value, isReadonly } = props;
  const { datasource } = value;
  const selectedDatasource = datasource ?? DEFAULT_DATASOURCE;

  const handleDatasourceChange: DatasourceSelectProps['onChange'] = useCallback(
    (newDatasourceSelection) => {
      if (!isVariableDatasource(newDatasourceSelection) && newDatasourceSelection.kind === DATASOURCE_KIND) {
        onChange({ ...value, datasource: newDatasourceSelection });
        return;
      }

      throw new Error('Got unexpected non OpenCostAllocationQuery datasource selection');
    },
    [onChange, value],
  );

  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      onChange({ ...value, query: event.target.value });
    },
    [onChange, value],
  );

  return (
    <div>
      <DatasourceSelect
        datasourcePluginKind={DATASOURCE_KIND}
        value={selectedDatasource}
        onChange={handleDatasourceChange}
        label="OpenCostAllocationQuery Datasource"
        readOnly={isReadonly}
        notched
      />
      <input
        aria-label="Query"
        onChange={handleQueryChange}
        placeholder="query"
        readOnly={isReadonly}
        value={value.query}
      />
    </div>
  );
}
