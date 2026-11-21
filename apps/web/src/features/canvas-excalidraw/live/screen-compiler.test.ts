import { describe, expect, it, vi } from "vitest";
import { inspectElement } from "@meld/screen-runtime/edit";
import { FIELDS } from "@meld/screen-runtime/edit/types";
import { COMPILER_STOPPED_MESSAGE, createScreenCompiler, createWorkerCompiler, type WorkerLike } from "./screen-compiler";
const source = {kind:'html' as const, files:{'index.html':'<b>Hi</b>'},entry:'index.html'};
function fakeWorker() {
  const handlers: Record<string,(event: {data?:unknown})=>void> = {};
  const worker = {postMessage:vi.fn(),addEventListener:vi.fn((type:string,handler:(event:{data?:unknown})=>void)=>{handlers[type]=handler;}),terminate:vi.fn()};
  return {worker:worker as unknown as WorkerLike,raw:worker,handlers};
}
describe('source worker client', () => {
  it('creates lazily and matches interleaved operations by ID', async () => {
    const fake=fakeWorker(); const make=vi.fn(()=>fake.worker); const compiler=createWorkerCompiler(make);
    expect(make).not.toHaveBeenCalled();
    const compile=compiler.compile(source,{tagElements:true}); const inspect=compiler.inspect(source.files,'index.html:0:9'); const tweak=compiler.tweak(source.files,'index.html:0:9',{field:'text',value:'X'}); const links=compiler.links(source.files);
    expect(fake.raw.postMessage.mock.calls.map(([r])=>[r.id,r.op])).toEqual([[0,'compile'],[1,'inspect'],[2,'tweak'],[3,'links']]);
    fake.handlers.message({data:{id:3,op:'links',result:['next']}});
    fake.handlers.message({data:{id:1,op:'inspect',result:null}});
    fake.handlers.message({data:{id:0,op:'compile',result:{ok:false,errors:[]}}});
    fake.handlers.message({data:{id:2,op:'tweak',result:{ok:false,reason:'not-literal'}}});
    await expect(links).resolves.toEqual(['next']); await expect(inspect).resolves.toBeNull(); await expect(compile).resolves.toEqual({ok:false,errors:[]}); await expect(tweak).resolves.toEqual({ok:false,reason:'not-literal'});
    expect(make).toHaveBeenCalledTimes(1);
  });
  it.each([{id:0,op:'inspect',result:null},{id:0,op:'compile',error:'failed'},{id:0,op:'compile',result:{ok:true,screen:'bad'}},{id:0,result:{ok:false,errors:[]}},{id:0,op:'compile',result:{ok:false,errors:[]},extra:true}])('rejects matching erroneous or malformed replies', async reply => {
    const fake=fakeWorker(); const compiler=createWorkerCompiler(()=>fake.worker); const pending=compiler.compile(source,{tagElements:true}); fake.handlers.message({data:reply}); await expect(pending).rejects.toThrow();
  });
  it('ignores unknown IDs and settles after a valid reply',async()=>{
    const fake=fakeWorker();const compiler=createWorkerCompiler(()=>fake.worker);const pending=compiler.links(source.files);
    fake.handlers.message({data:{id:999,op:'links',result:['wrong']}});fake.handlers.message({data:{id:0,op:'links',result:['next']}}); await expect(pending).resolves.toEqual(['next']);
  });
  it.each(['error','messageerror'])('rejects all pending on %s and restarts',async type=>{
    const fakes=[fakeWorker(),fakeWorker()];const make=vi.fn(()=>fakes[make.mock.calls.length-1].worker);const compiler=createWorkerCompiler(make);
    const a=compiler.compile(source,{tagElements:true}),b=compiler.links(source.files);fakes[0].handlers[type]({});await expect(a).rejects.toThrow(COMPILER_STOPPED_MESSAGE);await expect(b).rejects.toThrow(COMPILER_STOPPED_MESSAGE);expect(fakes[0].raw.terminate).toHaveBeenCalled();
    const next=compiler.links(source.files);fakes[1].handlers.message({data:{id:2,op:'links',result:[]}});await expect(next).resolves.toEqual([]);
  });
  it('rejects synchronous post failures without leaking waiters',async()=>{
    const fake=fakeWorker();fake.raw.postMessage.mockImplementationOnce(()=>{throw new Error('clone failed');});const compiler=createWorkerCompiler(()=>fake.worker);await expect(compiler.links(source.files)).rejects.toThrow('clone failed');compiler.dispose();
  });
  it('rejects disposed pending calls and future calls',async()=>{
    const fake=fakeWorker();const compiler=createWorkerCompiler(()=>fake.worker);const pending=compiler.links(source.files);compiler.dispose();await expect(pending).rejects.toThrow('closed');await expect(compiler.links(source.files)).rejects.toThrow('closed');
  });
  it('provides a read-only diagnostic without Worker',async()=>{
    vi.stubGlobal('Worker',undefined);try {const compiler=createScreenCompiler();await expect(compiler.compile(source,{tagElements:true})).resolves.toEqual({ok:false,errors:[{file:'',message:'This browser could not start the screen editor.'}]});await expect(compiler.links(source.files)).rejects.toThrow('This browser');}finally{vi.unstubAllGlobals();}
  });
});

it.each([
  ['inspect',{text:{editable:true,value:'partial'}}],
  ['tweak',{ok:true,files:{}}],
  ['links',['INVALID LINK']],
] as const)('rejects malformed %s result payloads',async(op,result)=>{
  const fake=fakeWorker();const compiler=createWorkerCompiler(()=>fake.worker);
  const pending=op==='inspect'?compiler.inspect(source.files,'index.html:0:9'):op==='tweak'?compiler.tweak(source.files,'index.html:0:9',{field:'text',value:'X'}):compiler.links(source.files);
  fake.handlers.message({data:{id:0,op,result}});await expect(pending).rejects.toThrow('Invalid screen worker reply');
});
it('accepts the inspection the editor really produces',async()=>{
  const fake=fakeWorker();const compiler=createWorkerCompiler(()=>fake.worker);const pending=compiler.inspect(source.files,'index.html:0:9');
  // The real inspection, so a field added to the editor can never again be rejected here.
  const result=inspectElement(source.files,'index.html:0:9');expect(result).not.toBeNull();
  fake.handlers.message({data:{id:0,op:'inspect',result}});await expect(pending).resolves.toEqual(result);
});
it('accepts a complete compile success',async()=>{
  const fake=fakeWorker();const compiler=createWorkerCompiler(()=>fake.worker);const pending=compiler.compile(source,{tagElements:true});
  const result={ok:true,screen:{kind:'html',styles:[],scripts:[],html:'<b>Hi</b>',links:[]}};
  fake.handlers.message({data:{id:0,op:'compile',result}});await expect(pending).resolves.toEqual(result);
});
it('rejects failed worker construction as a promise',async()=>{
  const compiler=createWorkerCompiler(()=>{throw new Error('Worker denied');});await expect(compiler.compile(source,{tagElements:true})).rejects.toThrow('Worker denied');
});
it('ignores messages and errors from a previous crashed worker',async()=>{
  const fakes=[fakeWorker(),fakeWorker()];const make=vi.fn(()=>fakes[make.mock.calls.length-1].worker);const compiler=createWorkerCompiler(make);
  const first=compiler.links(source.files);fakes[0].handlers.error({});await expect(first).rejects.toThrow();
  const second=compiler.links(source.files);fakes[0].handlers.message({data:{id:1,op:'links',result:['old']}});fakes[0].handlers.error({});fakes[1].handlers.message({data:{id:1,op:'links',result:['new']}});await expect(second).resolves.toEqual(['new']);expect(fakes[1].raw.terminate).not.toHaveBeenCalled();
});
describe('inspection replies', () => {
  it('accepts an inspection reply that carries every edit field',async()=>{
    const fake=fakeWorker();const compiler=createWorkerCompiler(()=>fake.worker);
    const pending=compiler.inspect(source.files,'index.html:0:9');
    const result=Object.fromEntries(FIELDS.map(field=>[field,{editable:true,value:'1'}]));
    fake.handlers.message({data:{id:0,op:'inspect',result}});
    await expect(pending).resolves.toEqual(result);
  });
  it('rejects an inspection reply that is missing a field',async()=>{
    const fake=fakeWorker();const compiler=createWorkerCompiler(()=>fake.worker);
    const pending=compiler.inspect(source.files,'index.html:0:9');
    const result=Object.fromEntries(FIELDS.slice(1).map(field=>[field,{editable:true,value:'1'}]));
    fake.handlers.message({data:{id:0,op:'inspect',result}});
    await expect(pending).rejects.toThrow();
  });
});
