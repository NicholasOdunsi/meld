import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  claimReadyTask,
  closeGatewayFixtureDatabase,
  createReadyTask,
  expireAttempt,
  readTask,
  resetGatewayFixture,
  type GatewayFixture,
} from "./integration-fixtures";

describe("gateway integration fixtures", () => {
  let fixture: GatewayFixture;

  beforeEach(async () => {
    fixture = await resetGatewayFixture();
  });

  afterAll(async () => {
    await closeGatewayFixtureDatabase();
  });

  it("creates, claims, expires, and reads an isolated fixed task", async () => {
    const taskId = await createReadyTask(fixture);
    const attemptId = await claimReadyTask(taskId);

    await expireAttempt(attemptId);

    const task = await readTask(taskId);
    expect(task).toMatchObject({
      id: taskId,
      status: "running",
      result: null,
      errorCode: null,
      eventCount: 0,
      currentAttemptId: attemptId,
      attempts: [
        {
          id: attemptId,
          attemptNo: 1,
          settledAt: null,
        },
      ],
    });
    expect(task.attempts[0]?.leaseExpiresAt.getTime()).toBeLessThan(
      Date.now(),
    );
  });

  it("resets only its fixed rows and reuses deterministic task IDs", async () => {
    const firstTaskId = await createReadyTask(fixture);

    fixture = await resetGatewayFixture();
    const secondTaskId = await createReadyTask(fixture);

    expect(secondTaskId).toBe(firstTaskId);
    expect(await readTask(secondTaskId)).toMatchObject({
      id: secondTaskId,
      status: "ready_to_run",
      attempts: [],
    });
  });
});
