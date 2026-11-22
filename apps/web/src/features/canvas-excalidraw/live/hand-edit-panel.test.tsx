// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import type { Inspection } from "@meld/screen-runtime/edit/types";
import type { ScreenSource } from "@meld/screen-runtime/source";
import { createEditDraft, type Draft, type Read, type Write } from "./edit-draft";
import type { LiveController } from "./live-controller";
import type { ScreenCompiler } from "./screen-compiler";
import { HandEditPanel, type HandEditPanelProps } from "./hand-edit-panel";
import type { CodeEditorProps } from "./code-editor";

vi.mock('./code-editor',()=>({default:({source,onChange,readOnly}:CodeEditorProps)=><textarea aria-label="Test editor" readOnly={readOnly} value={source.files[source.entry]} onChange={e=>onChange({...source.files,[source.entry]:e.target.value})}/> }));
vi.mock('./tweak-panel',()=>({TweakPanel:({label,fields,computed,used,onTweak,onAdd,canAdd,addReason,isPending,selectionKey}: {isPending?:boolean;selectionKey?:string;label:string;fields:NonNullable<Inspection>;computed:{color:string}|null;used:readonly string[];onTweak:(t:{field:'color';value:string})=>void;onAdd:()=>void;canAdd:boolean;addReason?:string})=><section data-testid="tweak-panel" data-pending={isPending?'yes':'no'} data-selection={selectionKey}><p>{label}</p><p data-testid="computed">{computed?.color??'none'}</p><p data-testid="used">{used.join(',')}</p><button onClick={()=>onTweak({field:'color',value:'#abcdef'})} disabled={!fields.color.editable}>Apply colour</button><button onClick={onAdd} disabled={!canAdd}>Add to chat</button><p>{addReason}</p></section>}));

const source:ScreenSource={kind:'html',entry:'index.html',files:{'index.html':'<b>Hi</b>'}};
const drafts:Draft[]=[];
afterEach(()=>{cleanup();for(const d of drafts.splice(0))d.dispose();});
function setup(overrides:Partial<HandEditPanelProps>={},write:Write=vi.fn(async()=>({status:'saved' as const,versionId:'v2'})),read:Read=async()=>null){
 const draft=createEditDraft(source,'v1',write,read);drafts.push(draft);
 const liveState={phase:'running' as const,screenId:'a',frameId:'frame',attempt:1,source,document:'doc',errors:[]};
 const live={getState:()=>liveState,subscribe:()=>()=>{},canPick:()=>true,setPickEnabled:vi.fn(),previewDraft:vi.fn()} as unknown as LiveController;
 const compiler={inspect:vi.fn(async()=>null),tweak:vi.fn(async()=>({ok:false as const,reason:'not-literal' as const}))} as unknown as ScreenCompiler;
 const onClose=vi.fn();const onTabChange=vi.fn();
 const props:HandEditPanelProps={draft,boardId:'a',tab:'code',compiler,live,picked:null,readOnly:false,issues:[],onClose,onTabChange,...overrides};
 return {props,draft,live,compiler,write,onClose,onTabChange};
}
describe('HandEditPanel',()=>{
 it('invalidates pick and previews code synchronously without previewing save acknowledgements',async()=>{
  const s=setup();render(<HandEditPanel {...s.props}/>);const editor=await screen.findByLabelText('Test editor');
  fireEvent.change(editor,{target:{value:'<b>New</b>'}});
  expect(s.live.setPickEnabled).not.toHaveBeenCalled();expect(s.live.previewDraft).toHaveBeenCalledWith('a',{...source,files:{'index.html':'<b>New</b>'}},1,'code');
  await act(()=>s.draft.flush());expect(s.live.previewDraft).toHaveBeenCalledTimes(1);
 });
 it('preserves the editor host across base saves, tabs and board aliases',async()=>{
  const s=setup();const view=render(<HandEditPanel {...s.props}/>);const editor=await screen.findByLabelText('Test editor');fireEvent.change(editor,{target:{value:'<b>New</b>'}});await act(()=>s.draft.flush());
  view.rerender(<HandEditPanel {...s.props} boardId="converted" tab="tweak"/>);view.rerender(<HandEditPanel {...s.props} boardId="converted"/>);expect(await screen.findByLabelText('Test editor')).toBe(editor);
 });
 it('ignores an inspection that resolves after a code revision',async()=>{
  let resolve!:(fields:Inspection)=>void;const s=setup({tab:'tweak',picked:{boardId:'a',src:'index.html:0:9',label:'Hi',epoch:1,revision:0,computed:null}});vi.mocked(s.compiler.inspect).mockReturnValue(new Promise(r=>{resolve=r;}));const view=render(<HandEditPanel {...s.props}/>);
  await waitFor(()=>expect(s.compiler.inspect).toHaveBeenCalled());act(()=>s.draft.replace({'index.html':'<b>New</b>'}));await act(async()=>resolve({color:{editable:true,value:'#000000'}} as Inspection));expect(screen.queryByTestId('tweak-panel')).toBeNull();view.unmount();
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
  const selected={boardId:'a',src:'index.html:0:9',label:'Hi',epoch:1,revision:0,computed:null};
  const s=setup({tab:'tweak',picked:selected});vi.mocked(s.compiler.inspect).mockResolvedValue({color:{editable:true,value:'#000000'}} as Inspection);
  vi.mocked(s.compiler.tweak).mockResolvedValue({ok:true,files:{'index.html':'<b style="color:#abcdef">Hi</b>'}});
  render(<HandEditPanel {...s.props}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'Apply colour'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Apply colour'}));
  await waitFor(()=>expect(s.live.previewDraft).toHaveBeenCalledWith('a',expect.objectContaining({files:{'index.html':'<b style="color:#abcdef">Hi</b>'}}),1,'tweak'));
  expect(s.live.setPickEnabled).not.toHaveBeenCalled();await waitFor(()=>expect(screen.queryByTestId('tweak-panel')).toBeNull());
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
it('shows no tweak body when inspection cannot verify the picked span',async()=>{
  const s=setup({tab:'tweak',picked:{boardId:'a',src:'index.html:0:8',label:'Hi',epoch:1,revision:0,computed:null},onAddElement:vi.fn(),identity:()=>({screenId:'persisted'})});render(<HandEditPanel {...s.props}/>);await waitFor(()=>expect(s.compiler.inspect).toHaveBeenCalled());expect(screen.queryByTestId('tweak-panel')).toBeNull();expect(screen.queryByRole('button',{name:'Add to chat'})).toBeNull();
});
it('renders the tweak panel only for a valid pick and passes label, computed and used colours',async()=>{
  const computed={color:'rgb(255, 0, 0)',backgroundColor:'rgb(0, 0, 255)'} as never;
  const s=setup({tab:'tweak',picked:{boardId:'a',src:'index.html:0:9',label:'Hi',epoch:1,revision:0,computed}});
  vi.mocked(s.compiler.inspect).mockResolvedValue({color:{editable:true,value:'#000000'}} as Inspection);
  const view=render(<HandEditPanel {...s.props}/>);expect(screen.queryByTestId('tweak-panel')).toBeNull();
  await waitFor(()=>expect(screen.getByTestId('tweak-panel')).toBeInTheDocument());
  expect(screen.getByText('Hi')).toBeInTheDocument();expect(screen.getByTestId('computed')).toHaveTextContent('rgb(255, 0, 0)');expect(screen.getByTestId('used')).toHaveTextContent('#ff0000,#0000ff');
  expect(screen.getByText('Add to chat will be available when chat is connected.')).toBeInTheDocument();
  view.unmount();
});
it('never renders a Pick button and never touches select mode',()=>{
  for(const tab of ['tweak','code'] as const){const s=setup({tab});const view=render(<HandEditPanel {...s.props}/>);expect(screen.queryByRole('button',{name:'Pick'})).toBeNull();view.unmount();expect(s.live.setPickEnabled).not.toHaveBeenCalled();}
});
it('shows Undo, Redo and Close in the panel header',()=>{
  const s=setup({tab:'tweak',readOnly:true});render(<HandEditPanel {...s.props}/>);expect(screen.getByRole('button',{name:'Undo'})).toHaveAttribute('aria-disabled','true');expect(screen.getByRole('button',{name:'Redo'})).toHaveAttribute('aria-disabled','true');expect(screen.getByText('Screen')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Close'}));expect(s.onClose).toHaveBeenCalledOnce();
});
it('forwards tab changes and a custom title',()=>{
  const s=setup({tab:'tweak',title:'Home'});render(<HandEditPanel {...s.props}/>);expect(screen.getByText('Home')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Code'}));expect(s.onTabChange).toHaveBeenCalledWith('code');
});
it('keeps the stopped-phase reload hint',()=>{
  const s=setup({tab:'tweak'});vi.spyOn(s.live,'getState').mockReturnValue({phase:'stopped',screenId:'a',frameId:'frame',attempt:1} as never);render(<HandEditPanel {...s.props}/>);expect(screen.getByText('Reload the live screen to select an element.')).toBeInTheDocument();
});
describe('undo/redo shortcuts',()=>{
  function key(target:Element,init:KeyboardEventInit){fireEvent.keyDown(target,{key:'z',...init});}
  it('undoes with Cmd+Z and redoes with Shift+Cmd+Z from inside the panel',()=>{
    const s=setup({tab:'tweak'});act(()=>s.draft.replace({'index.html':'<b>New</b>'}));render(<HandEditPanel {...s.props}/>);
    key(screen.getByRole('button',{name:'Close'}),{metaKey:true});expect(s.live.previewDraft).toHaveBeenLastCalledWith('a',source,2,'history');
    key(screen.getByRole('button',{name:'Close'}),{metaKey:true,shiftKey:true});expect(s.live.previewDraft).toHaveBeenLastCalledWith('a',expect.anything(),3,'history');
  });
  it('leaves Cmd+Z alone inside the code editor and when read-only',()=>{
    const s=setup({tab:'tweak'});act(()=>s.draft.replace({'index.html':'<b>New</b>'}));
    const view=render(<HandEditPanel {...s.props}/>);
    const host=document.createElement('div');host.className='cm-editor';const inner=document.createElement('div');inner.tabIndex=0;host.appendChild(inner);screen.getByTestId('live-panel').appendChild(host);
    key(inner,{metaKey:true});expect(s.live.previewDraft).not.toHaveBeenCalled();
    view.unmount();
    const r=setup({tab:'tweak',readOnly:true});act(()=>r.draft.replace({'index.html':'<b>New</b>'}));render(<HandEditPanel {...r.props}/>);key(screen.getByRole('button',{name:'Close'}),{metaKey:true});expect(r.live.previewDraft).not.toHaveBeenCalled();
  });
});

describe('keeping the selection after an edit',()=>{
  const selected={boardId:'a',src:'index.html:0:9',label:'Hi',epoch:1,revision:0,computed:null};
  it('asks to select the element again with its end moved by the change in length',async()=>{
    const onReselect=vi.fn();const s=setup({tab:'tweak',picked:selected,onReselect});
    vi.mocked(s.compiler.inspect).mockResolvedValue({color:{editable:true,value:'#000000'}} as Inspection);
    vi.mocked(s.compiler.tweak).mockResolvedValue({ok:true,files:{'index.html':'<b style="color:#abcdef">Hi</b>'}});
    render(<HandEditPanel {...s.props}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'Apply colour'})).toBeEnabled());
    fireEvent.click(screen.getByRole('button',{name:'Apply colour'}));
    const grew='<b style="color:#abcdef">Hi</b>'.length-'<b>Hi</b>'.length;
    await waitFor(()=>expect(onReselect).toHaveBeenCalledWith(`index.html:0:${9+grew}`));
    expect(onReselect).toHaveBeenCalledOnce();expect(s.live.previewDraft).toHaveBeenCalledWith('a',expect.anything(),1,'tweak');
  });
  it('drops it for code edits',async()=>{
    const onReselect=vi.fn();const s=setup({tab:'code',onReselect});render(<HandEditPanel {...s.props}/>);
    fireEvent.change(await screen.findByLabelText('Test editor'),{target:{value:'<b>New</b>'}});expect(onReselect).toHaveBeenLastCalledWith(null);
  });
  const inspected={color:{editable:true,value:'#000000'}} as Inspection;
  it('keeps the same element selected through Undo and Redo of a tweak',async()=>{
    const onReselect=vi.fn();
    const s=setup({tab:'tweak',onReselect,picked:{boardId:'a',src:'index.html:0:9',label:'Hi',epoch:1,revision:0,computed:null}});
    vi.mocked(s.compiler.inspect).mockResolvedValue(inspected);
    const styled='<b style="color:#abcdef">Hi</b>';
    vi.mocked(s.compiler.tweak).mockResolvedValue({ok:true,files:{'index.html':styled}});
    const view=render(<HandEditPanel {...s.props}/>);
    await waitFor(()=>expect(screen.getByRole('button',{name:'Apply colour'})).toBeEnabled());
    fireEvent.click(screen.getByRole('button',{name:'Apply colour'}));
    await waitFor(()=>expect(s.live.previewDraft).toHaveBeenCalledWith('a',expect.anything(),1,'tweak'));
    // The frame recompiles and the element is selected again, now at its longer span.
    view.rerender(<HandEditPanel {...s.props} picked={{boardId:'a',src:`index.html:0:${styled.length}`,label:'Hi',epoch:2,revision:1,computed:null}}/>);
    await waitFor(()=>expect(screen.getByRole('button',{name:'Apply colour'})).toBeEnabled());
    onReselect.mockClear();
    fireEvent.click(screen.getByRole('button',{name:'Undo'}));
    expect(s.live.previewDraft).toHaveBeenLastCalledWith('a',expect.anything(),2,'history');
    expect(onReselect).toHaveBeenCalledOnce();expect(onReselect).toHaveBeenLastCalledWith('index.html:0:9');
    view.rerender(<HandEditPanel {...s.props} picked={{boardId:'a',src:'index.html:0:9',label:'Hi',epoch:3,revision:2,computed:null}}/>);
    await waitFor(()=>expect(screen.getByRole('button',{name:'Redo'})).toBeEnabled());
    onReselect.mockClear();
    fireEvent.click(screen.getByRole('button',{name:'Redo'}));
    expect(onReselect).toHaveBeenLastCalledWith(`index.html:0:${styled.length}`);
  });
  it('drops the selection when Undo removes the element',async()=>{
    const onReselect=vi.fn();const two='<b>Hi</b><i>x</i>';
    const s=setup({tab:'tweak',onReselect,picked:{boardId:'a',src:'index.html:9:17',label:'x',epoch:1,revision:1,computed:null}});
    act(()=>s.draft.replace({'index.html':two}));
    vi.mocked(s.compiler.inspect).mockResolvedValue(inspected);
    render(<HandEditPanel {...s.props}/>);
    await waitFor(()=>expect(screen.getByRole('button',{name:'Apply colour'})).toBeEnabled());
    fireEvent.click(screen.getByRole('button',{name:'Undo'}));
    expect(s.live.previewDraft).toHaveBeenLastCalledWith('a',source,2,'history');
    expect(onReselect).toHaveBeenLastCalledWith(null);
  });
  it('selects nothing again after Undo when nothing was selected',()=>{
    const onReselect=vi.fn();const s=setup({tab:'tweak',onReselect});act(()=>s.draft.replace({'index.html':'<b>New</b>'}));
    render(<HandEditPanel {...s.props}/>);fireEvent.click(screen.getByRole('button',{name:'Undo'}));expect(onReselect).toHaveBeenLastCalledWith(null);
  });
});
it('stops Cmd+Z reaching Excalidraw when the panel handles it',()=>{
  const s=setup({tab:'tweak'});act(()=>s.draft.replace({'index.html':'<b>New</b>'}));render(<HandEditPanel {...s.props}/>);
  const outside=vi.fn();document.addEventListener('keydown',outside);
  fireEvent.keyDown(screen.getByRole('button',{name:'Close'}),{key:'z',metaKey:true});
  expect(s.live.previewDraft).toHaveBeenCalledOnce();expect(outside).not.toHaveBeenCalled();
  document.removeEventListener('keydown',outside);
});

describe('HandEditPanel interact',()=>{
 it('shows the header Interact toggle only when given, and calls it',async()=>{
  const s=setup({tab:'tweak'});const view=render(<HandEditPanel {...s.props}/>);
  expect(screen.queryByRole('button',{name:'Interact'})).toBeNull();
  const onToggle=vi.fn();
  view.rerender(<HandEditPanel {...s.props} interact={{pressed:true,onToggle}}/>);
  const button=screen.getByRole('button',{name:'Interact'});
  expect(button).toHaveAttribute('aria-pressed','true');
  fireEvent.click(button);expect(onToggle).toHaveBeenCalledOnce();
 });
});

describe('the Tweak body through an edit',()=>{
  const inspected={color:{editable:true,value:'#000000'}} as Inspection;
  const styled='<b style="color:#abcdef">Hi</b>';
  const again=`index.html:0:${styled.length}`;
  // Like the board: the pending reselect the panel asks for comes straight back as a prop.
  function Harness({props,picked}:{props:HandEditPanelProps;picked:HandEditPanelProps['picked']}){
    const [reselect,setReselect]=useState<string|null>(null);
    return <HandEditPanel {...props} picked={picked} reselect={reselect} onReselect={(src)=>{props.onReselect?.(src);setReselect(src);}}/>;
  }
  async function tweaked(){
    const onReselect=vi.fn();
    const first={boardId:'a',src:'index.html:0:9',label:'Hi',epoch:1,revision:0,computed:null};
    const s=setup({tab:'tweak',onReselect});
    vi.mocked(s.compiler.inspect).mockResolvedValue(inspected);
    vi.mocked(s.compiler.tweak).mockResolvedValue({ok:true,files:{'index.html':styled}});
    const view=render(<Harness props={s.props} picked={first}/>);
    await waitFor(()=>expect(screen.getByRole('button',{name:'Apply colour'})).toBeEnabled());
    const body=screen.getByTestId('tweak-panel');
    fireEvent.click(screen.getByRole('button',{name:'Apply colour'}));
    await waitFor(()=>expect(s.live.previewDraft).toHaveBeenCalledWith('a',expect.anything(),1,'tweak'));
    return {s,view,onReselect,body,first};
  }
  it('keeps the same body mounted (pending) until the element is read again',async()=>{
    const {s,view,body}=await tweaked();
    // Reselect pending: the old values stay, marked pending.
    expect(screen.getByTestId('tweak-panel')).toBe(body);
    expect(body).toHaveAttribute('data-pending','yes');
    // The pick comes back; its inspection is still in flight.
    let resolve!:(fields:Inspection)=>void;
    vi.mocked(s.compiler.inspect).mockReturnValue(new Promise(r=>{resolve=r;}));
    view.rerender(<Harness props={s.props} picked={{boardId:'a',src:again,label:'Hi',epoch:2,revision:1,computed:null}}/>);
    expect(screen.getByTestId('tweak-panel')).toBe(body);
    await act(async()=>resolve(inspected));
    expect(screen.getByTestId('tweak-panel')).toBe(body);
    expect(body).toHaveAttribute('data-pending','no');
  });
  it('shows nothing stale when the reselect times out and another element is picked',async()=>{
    const control:{drop:()=>void}={drop:()=>{}};
    function Timing({props,picked}:{props:HandEditPanelProps;picked:HandEditPanelProps['picked']}){
      const [reselect,setReselect]=useState<string|null>(null);
      control.drop=()=>setReselect(null);
      return <HandEditPanel {...props} picked={picked} reselect={reselect} onReselect={setReselect}/>;
    }
    const first={boardId:'a',src:'index.html:0:9',label:'Hi',epoch:1,revision:0,computed:null};
    const s=setup({tab:'tweak'});
    vi.mocked(s.compiler.inspect).mockResolvedValue(inspected);
    vi.mocked(s.compiler.tweak).mockResolvedValue({ok:true,files:{'index.html':styled}});
    const view=render(<Timing props={s.props} picked={first}/>);
    await waitFor(()=>expect(screen.getByRole('button',{name:'Apply colour'})).toBeEnabled());
    fireEvent.click(screen.getByRole('button',{name:'Apply colour'}));
    await waitFor(()=>expect(s.live.previewDraft).toHaveBeenCalled());
    expect(screen.getByTestId('tweak-panel')).toHaveAttribute('data-pending','yes');
    act(()=>control.drop());
    expect(screen.queryByTestId('tweak-panel')).toBeNull();
    // Another element is picked on the new source; its inspection is still in flight.
    vi.mocked(s.compiler.inspect).mockReturnValue(new Promise(()=>{}));
    view.rerender(<Timing props={s.props} picked={{boardId:'a',src:`index.html:40:60`,label:'Other',epoch:3,revision:1,computed:null}}/>);
    expect(screen.queryByTestId('tweak-panel')).toBeNull();
    expect(screen.queryByText('Hi')).toBeNull();
  });
  it('keeps one selection key for the same element through a tweak, and another for a different one',async()=>{
    const {s,view}=await tweaked();
    const key=screen.getByTestId('tweak-panel').getAttribute('data-selection');
    expect(key).toBeTruthy();
    vi.mocked(s.compiler.inspect).mockResolvedValue(inspected);
    view.rerender(<Harness props={s.props} picked={{boardId:'a',src:again,label:'Hi',epoch:2,revision:1,computed:null}}/>);
    await waitFor(()=>expect(screen.getByTestId('tweak-panel')).toHaveAttribute('data-pending','no'));
    expect(screen.getByTestId('tweak-panel').getAttribute('data-selection')).toBe(key);
    view.rerender(<Harness props={s.props} picked={{boardId:'a',src:'index.html:40:60',label:'Other',epoch:3,revision:1,computed:null}}/>);
    await waitFor(()=>expect(screen.getByText('Other')).toBeInTheDocument());
    expect(screen.getByTestId('tweak-panel').getAttribute('data-selection')).not.toBe(key);
  });
  it('Undo right after a tweak remaps the element that is about to be selected again',async()=>{
    const {s,onReselect}=await tweaked();
    expect(onReselect).toHaveBeenLastCalledWith(again);
    onReselect.mockClear();
    fireEvent.click(screen.getByRole('button',{name:'Undo'}));
    expect(s.live.previewDraft).toHaveBeenLastCalledWith('a',source,2,'history');
    expect(onReselect).toHaveBeenLastCalledWith('index.html:0:9');
  });
  it('disables the Tweak tab with its reason and never switches to it',()=>{
    const s=setup({tab:'code',tweakDisabledReason:'Click something in the screen to tweak it'});
    render(<HandEditPanel {...s.props}/>);
    const tab=screen.getByRole('button',{name:'Tweak'});
    expect(tab).toHaveAttribute('aria-disabled','true');
    fireEvent.click(tab);
    expect(s.onTabChange).not.toHaveBeenCalled();
  });
});
