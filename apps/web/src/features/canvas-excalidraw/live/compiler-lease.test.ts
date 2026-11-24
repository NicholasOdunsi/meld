import { afterEach,expect,it,vi } from "vitest";
import { createCompilerLease } from "./compiler-lease";
afterEach(()=>vi.useRealTimers());
it("survives StrictMode replay and waits for a departing save before disposal",async()=>{
 vi.useFakeTimers();const compiler={dispose:vi.fn()},lease=createCompilerLease(compiler);
 lease.retain();lease.release(Promise.resolve());lease.retain();
 await vi.advanceTimersByTimeAsync(0);expect(compiler.dispose).not.toHaveBeenCalled();
 let ack!:()=>void;const save=new Promise<void>(resolve=>{ack=resolve;});
 lease.release(save);await vi.advanceTimersByTimeAsync(2000);
 expect(compiler.dispose).not.toHaveBeenCalled();ack();await vi.advanceTimersByTimeAsync(0);
 expect(compiler.dispose).toHaveBeenCalledOnce();
});
