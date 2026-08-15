import { GasApiClient } from '../api/GasApiClient';
import { AuthRepository } from '../repositories/AuthRepository';
import { OrderRepository } from '../repositories/OrderRepository';
import { SyncRepository } from '../repositories/SyncRepository';
import { TripsRepository } from '../repositories/TripsRepository';
import { LogRepository } from '../repositories/LogRepository';
import { OrderService } from '../services/OrderService';
import { GAS_URL } from '../../constants';

export class AppContainer {
  private static instance: AppContainer;
  
  public apiClient: GasApiClient;
  public authRepo: AuthRepository;
  public orderRepo: OrderRepository;
  public syncRepo: SyncRepository;
  public tripsRepo: TripsRepository;
  public logRepo: LogRepository;
  public orderService: OrderService;

  private constructor() {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('nm_gas_url') : null;
    const initialUrl = (saved && saved !== 'undefined' && saved !== 'null' && saved.trim() !== '') ? saved.trim() : GAS_URL;
    this.apiClient = new GasApiClient(initialUrl);

    this.authRepo = new AuthRepository(this.apiClient);
    this.orderRepo = new OrderRepository(this.apiClient);
    this.syncRepo = new SyncRepository(this.apiClient);
    this.tripsRepo = new TripsRepository(this.apiClient);
    this.logRepo = new LogRepository(this.apiClient);
    this.orderService = new OrderService(this.orderRepo);
  }

  public static getInstance(): AppContainer {
    if (!AppContainer.instance) {
      AppContainer.instance = new AppContainer();
    }
    return AppContainer.instance;
  }

  public updateApiEndpoint(url: string) {
    const validUrl = (url && url.trim() !== '' && url !== 'undefined' && url !== 'null') ? url.trim() : GAS_URL;
    this.apiClient.setEndpoint(validUrl);
  }
}

export const container = AppContainer.getInstance();
