// Runtime-neutral gateway modules shared with apps/gateway-worker.
export {
  authenticateDevice,
  DeviceAuthenticationError,
  type AuthenticatedDeviceIdentity,
} from "./auth/device-auth";
export {
  DeviceSession,
  DeviceSessionRegistry,
  type DeviceSocket,
} from "./ws/device-session";
export { createProtocolHandler } from "./ws/protocol-handler";
export { createDispatchSweeper } from "./dispatch/sweeper";
export {
  createTaskRepository,
  type TaskRepository,
} from "./tasks/task-repository";
export { assertHeartbeatWithinLease } from "./config";
export {
  createDeepSeekTodoWriter,
  DEEPSEEK_TODO_DEFAULT_MODEL,
  type TodoWriter,
} from "./morning-todos/deepseek-todo-writer";
export {
  createMorningRepository,
  MAX_PROJECTS_PER_RUN,
  runMorningTodos,
  type MorningRepository,
  type MorningRpcClient,
  type MorningRunReport,
} from "./morning-todos/run-morning-todos";
