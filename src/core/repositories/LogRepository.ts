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
    try {
      const rawData = await this.apiClient.post<{ limit: number }, any[]>('getNotificationLogs', { limit });
      return DataMapper.mapNotificationLogs(rawData || []);
    } catch (e) {
      console.warn("後端尚不支援 getNotificationLogs:", e);
      return [];
    }
  }

  async getSystemLogs(limit: number = 200): Promise<SystemLog[]> {
    try {
      const rawData = await this.apiClient.post<{ limit: number }, any[]>('getSystemLogs', { limit });
      return DataMapper.mapSystemLogs(rawData || []);
    } catch (e) {
      console.warn("後端尚不支援 getSystemLogs:", e);
      return [];
    }
  }

  async runDryRun(ruleId: string): Promise<any> {
    return await this.apiClient.post('dryRunRule', { ruleId });
  }
}
