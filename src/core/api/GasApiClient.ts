import { ApiClient, ApiClientConfig } from './ApiClient';
import { GASResponse } from '../../types';
import { fetchWithRetry } from '../../utils/fetchUtils';

export class GasApiClient implements ApiClient {
  private baseConfig: ApiClientConfig;

  constructor(endpoint: string) {
    this.baseConfig = {
      endpoint,
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    };
  }

  setEndpoint(endpoint: string) {
    this.baseConfig.endpoint = endpoint;
  }

  getEndpoint(): string {
    return this.baseConfig.endpoint;
  }

  async post<T, R>(action: string, data: T, config?: Partial<ApiClientConfig>): Promise<R> {
    if (!this.baseConfig.endpoint) {
      throw new Error('API Endpoint is not configured');
    }

    const finalConfig = { ...this.baseConfig, ...config };
    const payload = { action, data };

    // 加入 45 秒的 Timeout（逾時中斷機制），避免 GAS 無回應導致該訂單死鎖
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    let res;
    try {
      res = await fetchWithRetry(finalConfig.endpoint, {
        method: 'POST',
        redirect: finalConfig.redirect,
        headers: finalConfig.headers,
        body: JSON.stringify(payload),
        signal: controller.signal // 將終止訊號掛載上來
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error("API Request Timeout: 超過 45 秒未回應");
      }
      throw err;
    } finally {
      clearTimeout(timeoutId); // 清除計時器
    }

    const json = await res.json() as GASResponse<any>;
    
    // Abstract the standard GAS response logic
    if (!json.success) {
      // Create a specific error that contains the errorCode for upstream handling
      const error = new Error(json.error || 'API Request Failed');
      (error as any).errorCode = json.errorCode;
      if (json.serverData) {
        (error as any).serverData = json.serverData;
      } else if (json.data) {
        (error as any).serverData = json.data;
      }
      throw error;
    }

    return json.data as R;
  }

  async get<R>(_: string, params?: Record<string, string>): Promise<R> {
    if (!this.baseConfig.endpoint) {
      throw new Error('API Endpoint is not configured');
    }
    
    let finalUrl = this.baseConfig.endpoint;
    
    // In our app, get requests to GAS use query params
    if (params) {
      const qs = new URLSearchParams(params).toString();
      finalUrl += `?${qs}`;
    }

    const res = await fetchWithRetry(finalUrl, { redirect: 'follow' });
    const json = await res.json() as GASResponse<any>;
    
    if (!json.success) {
      const error = new Error(json.error || 'API Request Failed');
      (error as any).errorCode = json.errorCode;
      if (json.serverData) {
        (error as any).serverData = json.serverData;
      } else if (json.data) {
        (error as any).serverData = json.data;
      }
      throw error;
    }

    return json.data as unknown as R;
  }
}
