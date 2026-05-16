import { ApiClient } from '../api/ApiClient';
import { Customer, Order, Product } from '../../types';

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
}

export interface ISyncRepository {
  sync(params: SyncDataParams): Promise<SyncDataResult>;
  checkUpdates(): Promise<{ globalLastUpdated: number }>;
}

export class SyncRepository implements ISyncRepository {
  constructor(private apiClient: ApiClient) {}

  async sync(params: SyncDataParams): Promise<SyncDataResult> {
    return this.apiClient.get<SyncDataResult>('', params as any);
  }

  async checkUpdates(): Promise<{ globalLastUpdated: number }> {
    return this.apiClient.post<any, { globalLastUpdated: number }>('checkUpdates', {});
  }
}
