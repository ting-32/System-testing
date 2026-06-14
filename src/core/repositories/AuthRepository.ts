import { ApiClient } from '../api/ApiClient';

export interface IAuthRepository {
  login(password: string, deviceId?: string, userAgent?: string): Promise<any>;
  changePassword(oldPassword: string, newPassword: string, deviceId?: string, userAgent?: string): Promise<boolean>;
}

export class AuthRepository implements IAuthRepository {
  constructor(private apiClient: ApiClient) {}

  async login(password: string, deviceId?: string, userAgent?: string): Promise<any> {
    const data = await this.apiClient.post<any, any>('login', { password, deviceId, userAgent });
    // 如果後端的 result 就是 json.data
    // 如果舊版回傳 true, 我們這裡兼容一下
    if (data === true) return true;
    return data;
  }

  async changePassword(oldPassword: string, newPassword: string, deviceId?: string, userAgent?: string): Promise<boolean> {
    const data = await this.apiClient.post<any, boolean>('changePassword', { oldPassword, newPassword, deviceId, userAgent });
    return data === true;
  }
}
