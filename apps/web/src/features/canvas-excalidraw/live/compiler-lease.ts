import type { ScreenCompiler } from "./screen-compiler";

// StrictMode immediately retains the same facade again. A real departure
// keeps its worker available until draft persistence has extracted its links.
export function createCompilerLease(compiler:Pick<ScreenCompiler,"dispose">){
  let users=0,cleanup:ReturnType<typeof setTimeout>|undefined;
  const pending=new Set<Promise<unknown>>();
  function finish(){if(!users && !pending.size)compiler.dispose();}
  return {
    retain(){users++;clearTimeout(cleanup);},
    release(work:Promise<unknown>){
      users--;pending.add(work);
      const settled=()=>{pending.delete(work);cleanup=setTimeout(finish,0);};
      void work.then(settled,settled);
    },
  };
}
