// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Inspection } from "@meld/screen-runtime/edit/types";
import type { ScreenSource } from "@meld/screen-runtime/source";
import { createEditDraft, type Draft, type Read, type Write } from "./edit-draft";
import type { LiveController } from "./live-controller";
import type { ScreenCompiler } from "./screen-compiler";
import { HandEditPanel, type HandEditPanelProps } from "./hand-edit-panel";
import type { CodeEditorProps } from "./code-editor";

vi.mock('./code-editor',()=>({default:({source,onChange,readOnly}:CodeEditorProps)=><textarea aria-label="Test editor" readOnly={readOnly} value={source.files[source.entry]} onChange={e=>onChange({...source.files,[source.entry]:e.target.value})}/> }));
vi.mock('./tweak-panel',()=>({TweakPanel:({fields,selectedLabel,onTweak,onTogglePick,onUndo,onRedo,canUndo,canRedo,pickDisabled,canAdd,addReason}: {fields:Inspection;selectedLabel:string|null;onTweak:(t:{field:'color';value:string})=>void;onTogglePick:()=>void;onUndo:()=>void;onRedo:()=>void;canUndo:boolean;canRedo:boolean;pickDisabled?:boolean;canAdd:boolean;addReason?:string})=><section><button onClick={onTogglePick} disabled={pickDisabled}>Pick</button><button onClick={onUndo} disabled={!canUndo}>Undo</button><button onClick={onRedo} disabled={!canRedo}>Redo</button><p>{selectedLabel}</p><button onClick={()=>onTweak({field:'color',value:'#abcdef'})} disabled={!fields?.color.editable}>Apply colour</button><button disabled={!canAdd}>Add to chat</button><p>{addReason}</p></section>}));

const source:ScreenSource={kind:'html',entry:'index.html',files:{'index.html':'<b>Hi</b>'}};
const drafts:Draft[]=[];
afterEach(()=>{cleanup();for(const d of drafts.splice(0))d.dispose();});
function setup(overrides:Partial<HandEditPanelProps>={},write:Write=vi.fn(async()=>({status:'saved' as const,versionId:'v2'})),read:Read=async()=>null){
 const draft=createEditDraft(source,'v1',write,read);drafts.push(draft);
 const liveState={phase:'running' as const,screenId:'a',frameId:'frame',attempt:1,source,document:'doc',errors:[]};
 const live={getState:()=>liveState,subscribe:()=>()=>{},canPick:()=>true,setPickEnabled:vi.fn(),previewDraft:vi.fn()} as unknown as LiveController;
 const compiler={inspect:vi.fn(async()=>null),tweak:vi.fn(async()=>({ok:false as const,reason:'not-literal' as const}))} as unknown as ScreenCompiler;
 const props:HandEditPanelProps={draft,boardId:'a',tab:'code',compiler,live,picked:null,readOnly:false,issues:[],...overrides};
 return {props,draft,live,compiler,write};
}
describe('HandEditPanel',()=>{
 it('invalidates pick and previews code synchronously without previewing save acknowledgements',async()=>{
  const s=setup();render(<HandEditPanel {...s.props}/>);const editor=await screen.findByLabelText('Test editor');
  fireEvent.change(editor,{target:{value:'<b>New</b>'}});
  expect(s.live.setPickEnabled).toHaveBeenLastCalledWith(false);expect(s.live.previewDraft).toHaveBeenCalledWith('a',{...source,files:{'index.html':'<b>New</b>'}},1,'code');
  await act(()=>s.draft.flush());expect(s.live.previewDraft).toHaveBeenCalledTimes(1);
 });
 it('preserves the editor host across base saves, tabs and board aliases',async()=>{
  const s=setup();const view=render(<HandEditPanel {...s.props}/>);const editor=await screen.findByLabelText('Test editor');fireEvent.change(editor,{target:{value:'<b>New</b>'}});await act(()=>s.draft.flush());
  view.rerender(<HandEditPanel {...s.props} boardId="converted" tab="tweak"/>);view.rerender(<HandEditPanel {...s.props} boardId="converted"/>);expect(await screen.findByLabelText('Test editor')).toBe(editor);
 });
 it('ignores an inspection that resolves after a code revision',async()=>{
  let resolve!:(fields:Inspection)=>void;const s=setup({tab:'tweak',picked:{boardId:'a',src:'index.html:0:9',label:'Hi',epoch:1,revision:0}});vi.mocked(s.compiler.inspect).mockReturnValue(new Promise(r=>{resolve=r;}));const view=render(<HandEditPanel {...s.props}/>);
  await waitFor(()=>expect(s.compiler.inspect).toHaveBeenCalled());act(()=>s.draft.replace({'index.html':'<b>New</b>'}));await act(async()=>resolve({color:{editable:true,value:'#000000'}} as Inspection));expect(screen.getByRole('button',{name:'Apply colour'})).toBeDisabled();view.unmount();
 });
 it('routes undo/redo through immediate history previews',async()=>{
  const s=setup({tab:'tweak'});act(()=>s.draft.replace({'index.html':'<b>New</b>'}));render(<HandEditPanel {...s.props}/>);fireEvent.click(screen.getByRole('button',{name:'Undo'}));expect(s.live.previewDraft).toHaveBeenLastCalledWith('a',source,2,'history');fireEvent.click(screen.getByRole('button',{name:'Redo'}));expect(s.live.previewDraft).toHaveBeenLastCalledWith('a',expect.anything(),3,'history');
 });
 it('keeps source visible while read-only and explains unavailable chat integration',async()=>{
  const s=setup({readOnly:true});render(<HandEditPanel {...s.props}/>);expect(await screen.findByLabelText('Test editor')).toHaveAttribute('readonly');
 });
 it('shows Retry for save failures and reload only for conflicts',async()=>{
  const write=vi.fn<Write>().mockResolvedValueOnce({status:'error'}).mockResolvedValue({status:'saved',versionId:'v2'});const s=setup({},write);s.draft.replace({'index.html':'<b>New</b>'});await s.draft.flush();render(<HandEditPanel {...s.props}/>);expect(screen.getByRole('button',{name:'Retry'})).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Reload latest'})).toBeNull();await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Retry'})));await waitFor(()=>expect(write).toHaveBeenCalledTimes(2));
 });
});

it('previews a worker tweak immediately and prevents a second stale response',async()=>{
  const selected={boardId:'a',src:'index.html:0:9',label:'Hi',epoch:1,revision:0};
  const s=setup({tab:'tweak',picked:selected});vi.mocked(s.compiler.inspect).mockResolvedValue({color:{editable:true,value:'#000000'}} as Inspection);
  vi.mocked(s.compiler.tweak).mockResolvedValue({ok:true,files:{'index.html':'<b style="color:#abcdef">Hi</b>'}});
  render(<HandEditPanel {...s.props}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'Apply colour'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Apply colour'}));
  await waitFor(()=>expect(s.live.previewDraft).toHaveBeenCalledWith('a',expect.objectContaining({files:{'index.html':'<b style="color:#abcdef">Hi</b>'}}),1,'tweak'));
  expect(s.live.setPickEnabled).toHaveBeenLastCalledWith(false);expect(screen.getByRole('button',{name:'Apply colour'})).toBeDisabled();
});
it('shows Reload latest on conflict and previews only a successful replacement',async()=>{
  const latest={...source,files:{'index.html':'<b>Latest</b>'}};
  const s=setup({},async()=>({status:'conflict',versionId:'v2'}),async()=>({source:latest,versionId:'v2'}));s.draft.replace({'index.html':'<b>New</b>'});await s.draft.flush();render(<HandEditPanel {...s.props}/>);
  expect(screen.queryByRole('button',{name:'Retry'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Reload latest'}));await waitFor(()=>expect(s.live.previewDraft).toHaveBeenCalledWith('a',latest,2,'history'));
});
it('never previews an old reload after switching active boards',async()=>{
  let finish!:(value:{source:ScreenSource;versionId:string})=>void;
  const s=setup({},async()=>({status:'conflict',versionId:'v2'}),()=>new Promise(resolve=>{finish=resolve;}));s.draft.replace({'index.html':'<b>New</b>'});await s.draft.flush();render(<HandEditPanel {...s.props}/>);fireEvent.click(screen.getByRole('button',{name:'Reload latest'}));
  vi.spyOn(s.live,'getState').mockReturnValue({phase:'compiling',screenId:'b',frameId:'another',attempt:3});await act(async()=>finish({source,versionId:'v2'}));expect(s.live.previewDraft).not.toHaveBeenCalled();
});
it('leaves Add to chat disabled when inspection cannot verify the picked span',async()=>{
  const s=setup({tab:'tweak',picked:{boardId:'a',src:'index.html:0:8',label:'Hi',epoch:1,revision:0},onAddElement:vi.fn(),identity:()=>({screenId:'persisted'})});render(<HandEditPanel {...s.props}/>);await waitFor(()=>expect(s.compiler.inspect).toHaveBeenCalled());expect(screen.getByRole('button',{name:'Add to chat'})).toBeDisabled();
});
it('disables pick when read-only and explains unavailable chat integration',()=>{
  const s=setup({tab:'tweak',readOnly:true});render(<HandEditPanel {...s.props}/>);expect(screen.getByRole('button',{name:'Pick'})).toBeDisabled();expect(screen.getByText('Add to chat will be available when chat is connected.')).toBeInTheDocument();
});

it('clears active picking when the panel closes',()=>{
  const s=setup({tab:'tweak'});const view=render(<HandEditPanel {...s.props}/>);fireEvent.click(screen.getByRole('button',{name:'Pick'}));expect(s.live.setPickEnabled).toHaveBeenLastCalledWith(true);view.unmount();expect(s.live.setPickEnabled).toHaveBeenLastCalledWith(false);
});
