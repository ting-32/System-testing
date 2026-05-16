export class PromiseQueue {
  private queues: Record<string, Promise<any>> = {};

  async enqueue<T>(taskId: string, initialValue: T, taskFn: (prev: T) => Promise<T>): Promise<T> {
    const prevTask = this.queues[taskId] || Promise.resolve(initialValue);
    
    const currentTask = prevTask
      .then(prevValue => taskFn(prevValue));

    // Ensure the queue continues even if the current task fails
    this.queues[taskId] = currentTask.catch(() => initialValue);
    
    // Throw error up to the caller
    return currentTask;
  }
}
