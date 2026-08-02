// A never-settling promise (e.g. a deadlocked PDF worker) is otherwise
// uncatchable and hangs the whole server action. Racing it against a timer
// converts the stall into a normal rejection the per-file catch can handle.
export function withTimeout<T>(
  work: () => Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    work().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (reason) => {
        clearTimeout(timer);
        reject(reason);
      },
    );
  });
}
