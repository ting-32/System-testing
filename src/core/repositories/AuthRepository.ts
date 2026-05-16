import { ApiClient } from '../api/ApiClient';

export interface IAuthRepository {
  login(password: string): Promise<boolean>;
  changePassword(oldPassword: string, newPassword: string): Promise<boolean>;
}

export class AuthRepository implements IAuthRepository {
  constructor(private apiClient: ApiClient) {}

  async login(password: string): Promise<boolean> {
    const data = await this.apiClient.post<{ password: string }, boolean>('login', { password });
    return data === true;
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
    const data = await this.apiClient.post<any, boolean>('changePassword', { oldPassword, newPassword });
    return data === true;
  }
}
