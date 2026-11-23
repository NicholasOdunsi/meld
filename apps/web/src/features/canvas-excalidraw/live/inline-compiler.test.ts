import { describe, expect, it } from "vitest";
import { createInlineCompiler } from "./inline-compiler";
const source = { kind: "react" as const, files: { "App.tsx": "export default function App() { return <main>Hi</main>; }" }, entry: "App.tsx" };
describe('explicit inline test adapter',()=>{
  it('compiles and preserves compiler diagnostics',async()=>{
    const compiler=createInlineCompiler();
    await expect(compiler.compile(source,{tagElements:false})).resolves.toMatchObject({ok:true});
    await expect(compiler.compile({...source,files:{'App.tsx':'import x from "next/link"; export default x;'}},{tagElements:false})).resolves.toEqual({ok:false,errors:[{file:'App.tsx',message:'Unsupported package: next/link'}]});
  });
  it('inspects, tweaks and extracts links without changing the input',async()=>{
    const compiler=createInlineCompiler();const files={'index.html':'<b data-goto="next">Hi</b>'};const src=`index.html:0:${files['index.html'].length}`;
    await expect(compiler.inspect(files,src)).resolves.toMatchObject({text:{editable:true,value:'Hi'}});
    await expect(compiler.tweak(files,src,{field:'text',value:'New'})).resolves.toEqual({ok:true,files:{'index.html':'<b data-goto="next">New</b>'}});
    await expect(compiler.links(files)).resolves.toEqual(['next']);expect(files['index.html']).toContain('Hi');
    compiler.dispose();await expect(compiler.inspect(files,src)).rejects.toThrow('closed');
  });
});
