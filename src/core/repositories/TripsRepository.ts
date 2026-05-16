import { ApiClient } from '../api/ApiClient';

export interface ITripsRepository {
  saveTrips(trips: string[]): Promise<boolean>;
}

export class TripsRepository implements ITripsRepository {
  constructor(private apiClient: ApiClient) {}

  async saveTrips(trips: string[]): Promise<boolean> {
    try {
      await this.apiClient.post<{ trips: string[] }, any>('saveTrips', { trips });
      return true;
    } catch (e) {
      console.error('Save Trips Error:', e);
      return false;
    }
  }
}
