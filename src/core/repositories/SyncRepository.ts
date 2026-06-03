import { ApiClient } from '../api/ApiClient';

export interface SyncDataParams {
  type: string;
  startDate: string;
  since?: string;
  _t: string;
}

export interface SyncDataResult {
  customers?: any[];
  orders?: any[];
  products?: any[];
  trips?: string[];
  serverGlobalTs?: number;
  settings?: any;
}

export interface ISyncRepository {
  sync(params: SyncDataParams, silentFail?: boolean): Promise<SyncDataResult>;
  checkUpdates(): Promise<{ globalLastUpdated: number }>;
}

export class SyncRepository implements ISyncRepository {
  constructor(private apiClient: ApiClient) {}

  async sync(params: SyncDataParams, silentFail?: boolean): Promise<SyncDataResult> {
    return this.apiClient.get<SyncDataResult>('', params as any, { silentFail });
  }

  async checkUpdates(): Promise<{ globalLastUpdated: number }> {
    return this.apiClient.post<any, { globalLastUpdated: number }>('checkUpdates', {}, { silentFail: true });
  }
}
