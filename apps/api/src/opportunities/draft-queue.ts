import { generateDraftJobId, queueNames } from "@mentionish/types";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export interface DraftQueue {
  enqueue(operationId: string): Promise<void>;
}
export function createDraftQueue(redisUrl: string): DraftQueue {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(queueNames.generateDraft, { connection });
  return {
    async enqueue(operationId) {
      await queue.add(
        queueNames.generateDraft,
        { operation_id: operationId },
        {
          jobId: generateDraftJobId(operationId),
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: 1000,
        },
      );
    },
  };
}
