import type { RequestHeaders } from '@perses-dev/client';
import type { DatasourceClient } from '@perses-dev/plugin-system';
import type { HTTPProxy } from '@perses-dev/spec';

export interface OpenCostDatasourceSpec {
  directUrl?: string;
  proxy?: HTTPProxy;
}

interface QueryRequestParameters extends Record<string, string> {
  query: string;
  start: string;
  end: string;
}

interface OpenCostDatasourceClientOptions {
  datasourceUrl: string;
  headers?: RequestHeaders;
}

export interface OpenCostDatasourceResponse {
  status: string;
  warnings?: string[];
  // TODO: adjust this type to match your datasource response shape
  data: unknown;
}

export interface OpenCostDatasourceClient extends DatasourceClient {
  options: OpenCostDatasourceClientOptions;
  query(params: QueryRequestParameters, headers?: RequestHeaders): Promise<OpenCostDatasourceResponse>;
}
