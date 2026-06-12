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
  allActiveOrderIds?: string[];
  latestSystemLogTs?: number;
  latestNotifyLogTs?: number;
}

export interface ISyncRepository {
  sync(params: SyncDataParams, silentFail?: boolean, signal?: AbortSignal): Promise<SyncDataResult>;
  checkUpdates(signal?: AbortSignal): Promise<{ globalLastUpdated: number }>;
}

export class SyncRepository implements ISyncRepository {
  constructor(private apiClient: ApiClient) {}

  async sync(params: SyncDataParams, silentFail?: boolean, signal?: AbortSignal): Promise<SyncDataResult> {
    return this.apiClient.get<SyncDataResult>('', params as any, { silentFail, signal });
  }

  async checkUpdates(signal?: AbortSignal): Promise<{ globalLastUpdated: number }> {
    return this.apiClient.post<any, { globalLastUpdated: number }>('checkUpdates', {}, { silentFail: true, signal });
  }
}
