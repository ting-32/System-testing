import { ApiClient } from '../api/ApiClient';
import { NotificationLog } from '../../types';
import { DataMapper } from '../mappers/DataMapper';

export interface ILogRepository {
  getNotificationLogs(limit?: number): Promise<NotificationLog[]>;
  runDryRun(ruleId: string): Promise<any>;
}

export class LogRepository implements ILogRepository {
  constructor(private apiClient: ApiClient) {}

  async getNotificationLogs(limit: number = 100): Promise<NotificationLog[]> {
    const rawData = await this.apiClient.post<{ limit: number }, any[]>('getNotificationLogs', { limit });
    return DataMapper.mapNotificationLogs(rawData || []);
  }

  async runDryRun(ruleId: string): Promise<any> {
    return await this.apiClient.post('dryRunRule', { ruleId });
  }
}
