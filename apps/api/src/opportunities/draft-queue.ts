export interface DraftQueue {
  enqueue(operationId: string): Promise<void>;
}
