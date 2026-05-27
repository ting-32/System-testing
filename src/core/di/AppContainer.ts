import { GasApiClient } from '../api/GasApiClient';
import { AuthRepository } from '../repositories/AuthRepository';
import { OrderRepository } from '../repositories/OrderRepository';
import { SyncRepository } from '../repositories/SyncRepository';
import { TripsRepository } from '../repositories/TripsRepository';
import { LogRepository } from '../repositories/LogRepository';
import { OrderService } from '../services/OrderService';

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
    // We start with an empty or default URL. It gets updated via setEndpoint dynamically.
    const initialUrl = localStorage.getItem('nm_gas_url') || '';
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
    this.apiClient.setEndpoint(url);
  }
}

export const container = AppContainer.getInstance();
