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
