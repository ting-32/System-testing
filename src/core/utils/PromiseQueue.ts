export class PromiseQueue {
  private queues: Record<string, Promise<any>> = {};
  private aborted: Set<string> = new Set(); // 記錄已被中斷的 taskId

  async enqueue<T>(taskId: string, initialValue: T, taskFn: (prev: T) => Promise<T>): Promise<T> {
    if (this.aborted.has(taskId)) {
       return Promise.reject(new Error("QUEUE_ABORTED: Previous task failed with conflict"));
    }

    const prevTask = this.queues[taskId] || Promise.resolve(initialValue);
    
    const currentTask = prevTask
      .then(prevValue => {
         if (this.aborted.has(taskId)) {
            throw new Error("QUEUE_ABORTED: Previous task failed with conflict");
         }
         return taskFn(prevValue);
      })
      .catch(error => {
         // 若發生版本衝突，標記該 taskId 為中斷，防禦後續任務亂覆蓋
         if (error?.message?.includes('VERSION_CONFLICT') || error?.errorCode === 'VERSION_CONFLICT') {
             this.aborted.add(taskId);
             // 設定一段過期時間後清理，讓重整後可以繼續
             setTimeout(() => {
                 this.aborted.delete(taskId);
                 delete this.queues[taskId];
             }, 10000); 
         }
         throw error;
      });

    // 確保 queue 不會因為 error 卡死後續，但在 currentTask 中已經 throw 出去了
    // 這個 catch 是為了讓下一個 enqueue 可以繼續串接而不 crash
    this.queues[taskId] = currentTask.catch(() => initialValue);
    
    // 將錯誤丟給外部（UI 或 Repository）
    return currentTask;
  }
  
  // 提供手動清理的方法 (供拉取最新資料後呼叫)
  clearAborted(taskId: string) {
     this.aborted.delete(taskId);
     delete this.queues[taskId];
  }
}
