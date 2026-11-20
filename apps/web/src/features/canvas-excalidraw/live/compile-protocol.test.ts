import { describe, expect, it } from "vitest";
import { handleSourceRequest } from "./compile-protocol";
const files = { "index.html": '<b data-goto="next">Hi</b>' };
const src = `index.html:0:${files['index.html'].length}`;
describe('source worker protocol', () => {
  it('dispatches compile, inspect, tweak and links through one protocol', () => {
    expect(handleSourceRequest({id:0,op:'compile',source:{kind:'html',entry:'index.html',files},tagElements:true})).toMatchObject({id:0,op:'compile',result:{ok:true}});
    expect(handleSourceRequest({id:1,op:'inspect',files,src})).toMatchObject({id:1,op:'inspect',result:{text:{editable:true,value:'Hi'}}});
    expect(handleSourceRequest({id:2,op:'tweak',files,src,tweak:{field:'text',value:'New'}})).toMatchObject({id:2,op:'tweak',result:{ok:true,files:{'index.html':'<b data-goto="next">New</b>'}}});
    expect(handleSourceRequest({id:3,op:'links',files})).toEqual({id:3,op:'links',result:['next']});
  });
  it.each([
    {id:1,op:'compile',source:{},tagElements:true},
    {id:1,op:'inspect',files,src,extra:true},
    {id:1,op:'inspect',files,src:''},
    {id:1,op:'tweak',files,src,tweak:{field:'bad',value:'x'}},
    {id:1,op:'tweak',files,src,tweak:{field:'text',value:'x'.repeat(262145)}},
    {id:1,op:'links',files:{}},
  ])('returns explicit failures for invalid requests with a valid identity', req => {
    expect(handleSourceRequest(req)).toMatchObject({id:1,op:req.op,error:expect.any(String)});
  });
  it.each([null,{}, {id:'x',op:'links',files}, {id:-1,op:'links',files},{id:9007199254740992,op:'links',files}])('ignores invalid request identities', req => expect(handleSourceRequest(req)).toBeNull());
});

it('bounds source identity and strict nested tweak shape',()=>{
  expect(handleSourceRequest({id:5,op:'inspect',files,src:'x'.repeat(156)})).toMatchObject({id:5,op:'inspect',error:expect.any(String)});
  expect(handleSourceRequest({id:6,op:'tweak',files,src,tweak:{field:'text',value:'',extra:true}})).toMatchObject({id:6,op:'tweak',error:expect.any(String)});
  expect(handleSourceRequest({id:7,op:'tweak',files,src,tweak:{field:'text',value:''}})).toMatchObject({id:7,op:'tweak',result:{ok:true}});
});

it.each([{id:8,op:'unknown'}, {id:8}])('settles identifiable malformed operations',req=>{
  expect(handleSourceRequest(req)).toEqual({id:8,op:'compile',error:'Invalid worker operation'});
});
