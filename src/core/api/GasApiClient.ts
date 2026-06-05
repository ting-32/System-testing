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

    let res;
    let timeoutToUse = finalConfig.timeoutMs ?? 25000;
    try {
      res = await fetchWithRetry(finalConfig.endpoint, {
        method: 'POST',
        redirect: finalConfig.redirect,
        headers: finalConfig.headers,
        body: JSON.stringify(payload),
        signal: finalConfig.signal
      }, undefined, 2, 1500, finalConfig.silentFail, timeoutToUse);
    } catch (err: any) {
      if (err.message === 'ABORTED_BY_USER' || err.message === 'ABORTED') {
         throw err;
      }
      if (err.name === 'AbortError' || err.message === 'TIMEOUT') {
        throw new Error(`API Request Timeout: 超過 ${timeoutToUse/1000} 秒未回應`);
      }
      throw err;
    }

    const json = await res.json() as GASResponse<any>;
    
    // Abstract the standard GAS response logic
    if (!json.success) {
      // Create a specific error that contains the errorCode for upstream handling
      const error = new Error(json.error || 'API Request Failed');
      (error as any).errorCode = json.errorCode;
      if ((json as any).serverData) {
        (error as any).serverData = (json as any).serverData;
      } else if (json.data) {
        (error as any).serverData = json.data;
      }
      throw error;
    }

    return json.data as R;
  }

  async get<R>(_: string, params?: Record<string, string>, config?: Partial<ApiClientConfig>): Promise<R> {
    if (!this.baseConfig.endpoint) {
      throw new Error('API Endpoint is not configured');
    }
    
    let finalUrl = this.baseConfig.endpoint;
    
    // In our app, get requests to GAS use query params
    if (params) {
      const qs = new URLSearchParams(params).toString();
      finalUrl += `?${qs}`;
    }

    const finalConfig = { ...this.baseConfig, ...config };
    const timeoutToUse = finalConfig.timeoutMs ?? 25000;
    
    let res;
    try {
      res = await fetchWithRetry(finalUrl, { 
        redirect: finalConfig.redirect, 
        headers: finalConfig.headers, 
        signal: finalConfig.signal 
      }, undefined, 2, 1500, finalConfig.silentFail, timeoutToUse);
    } catch (err: any) {
      if (err.message === 'ABORTED_BY_USER' || err.message === 'ABORTED') {
         throw err;
      }
      throw err;
    }
    
    const json = await res.json() as GASResponse<any>;
    
    if (!json.success) {
      const error = new Error(json.error || 'API Request Failed');
      (error as any).errorCode = json.errorCode;
      if ((json as any).serverData) {
        (error as any).serverData = (json as any).serverData;
      } else if (json.data) {
        (error as any).serverData = json.data;
      }
      throw error;
    }

    return json.data as unknown as R;
  }
}
