import { ApiClient } from '../api/ApiClient';
import { NotificationLog, SystemLog } from '../../types';
import { DataMapper } from '../mappers/DataMapper';

export interface SystemLogPageQuery {
  limit?: number;
  batchSize?: number;
  offset?: number;
  days?: number;
}

export interface SystemLogPageResult {
  logs: SystemLog[];
  totalRows: number | null;
  hasMore: boolean | null;
  paged: boolean;
}

export interface ILogRepository {
  getNotificationLogs(limit?: number): Promise<NotificationLog[]>;
  getSystemLogs(limit?: number): Promise<SystemLog[]>;
  getSystemLogsPage(query?: SystemLogPageQuery): Promise<SystemLogPageResult>;
  runDryRun(ruleId: string): Promise<any>;
}

export class LogRepository implements ILogRepository {
  constructor(private apiClient: ApiClient) {}

  async getNotificationLogs(limit: number = 100): Promise<NotificationLog[]> {
    try {
      const rawData = await this.apiClient.post<{ limit: number }, any>('getNotificationLogs', { limit });
      return DataMapper.mapNotificationLogs(rawData);
    } catch (e) {
      console.warn('Failed to fetch notification logs:', e);
      return [];
    }
  }

  async getSystemLogs(limit: number = 200): Promise<SystemLog[]> {
    try {
      const rawData = await this.apiClient.post<{ limit: number }, any>('getSystemLogs', { limit });
      return DataMapper.mapSystemLogs(rawData);
    } catch (e) {
      console.warn('Failed to fetch system logs:', e);
      return [];
    }
  }

  async getSystemLogsPage(query: SystemLogPageQuery = {}): Promise<SystemLogPageResult> {
    const batchSize = query.batchSize || query.limit || 200;
    const offset = query.offset || 0;
    const days = query.days || 0;
    const fallbackFullLimit = offset + batchSize;

    const rawData = await this.apiClient.post<any, any>('getSystemLogs', {
      limit: fallbackFullLimit,
      batchSize,
      offset,
      days,
      includeMeta: true,
    });

    if (rawData && !Array.isArray(rawData) && Array.isArray(rawData.logs)) {
      return {
        logs: DataMapper.mapSystemLogs(rawData.logs),
        totalRows: typeof rawData.totalRows === 'number' ? rawData.totalRows : null,
        hasMore: typeof rawData.hasMore === 'boolean' ? rawData.hasMore : null,
        paged: Boolean(rawData.paged),
      };
    }

    const mapped = DataMapper.mapSystemLogs(rawData);
    return {
      logs: mapped,
      totalRows: null,
      hasMore: mapped.length >= fallbackFullLimit ? true : false,
      paged: false,
    };
  }

  async runDryRun(ruleId: string): Promise<any> {
    return await this.apiClient.post('dryRunRule', { ruleId });
  }
}
