import { ApiClient } from '../api/ApiClient';
import { NotificationLog, SystemLog } from '../../types';
import { DataMapper } from '../mappers/DataMapper';

export interface ILogRepository {
  getNotificationLogs(limit?: number): Promise<NotificationLog[]>;
  getSystemLogs(limit?: number): Promise<SystemLog[]>;
  runDryRun(ruleId: string): Promise<any>;
}

export class LogRepository implements ILogRepository {
  constructor(private apiClient: ApiClient) {}

  async getNotificationLogs(limit: number = 100): Promise<NotificationLog[]> {
    const rawData = await this.apiClient.post<{ limit: number }, any[]>('getNotificationLogs', { limit });
    return DataMapper.mapNotificationLogs(rawData || []);
  }

  async getSystemLogs(limit: number = 200): Promise<SystemLog[]> {
    const rawData = await this.apiClient.post<{ limit: number }, any[]>('getSystemLogs', { limit });
    return DataMapper.mapSystemLogs(rawData || []);
  }

  async runDryRun(ruleId: string): Promise<any> {
    return await this.apiClient.post('dryRunRule', { ruleId });
  }
}
