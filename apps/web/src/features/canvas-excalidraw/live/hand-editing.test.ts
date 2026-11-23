import { afterEach, expect, it, vi } from "vitest";
import { createScreenStore } from "../screen-store";
const actions = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  convert: vi.fn(),
  mapping: vi.fn(),
}));
vi.mock("@/features/design/canvas-screen-source", () => ({
  readScreenSource: actions.read,
  saveScreenVersion: actions.save,
  convertBoardScreen: actions.convert,
  readBoardConversion: actions.mapping,
}));
vi.mock("../design-screen-board", () => ({
  boardScreenId: (id: string) => `ds-${id}`,
  formFactorForFrame: () => "mobile",
  relinkConvertedFrames: (
    _d: unknown,
    _f: string,
    _t: string,
    publish: () => void,
  ) => publish(),
}));
import { createHandEditing, RESELECT_COMPILE_WAIT_MS, RESELECT_WAIT_MS } from "./hand-editing";
const id = "ds-e5000000-0000-4000-8000-000000000001";
const source = {
  kind: "html" as const,
  entry: "index.html",
  files: { "index.html": "<button>Start</button>" },
};
function setup(access: "edit" | "view" = "edit", legacy=false) {
  actions.read.mockResolvedValue({
    status: "ok",
    screen: {
      legacy,
      screenId: id.slice(3),
      versionId: "v1",
      formFactor: "mobile",
      source,
      links: [],
    },
  });
  actions.save.mockResolvedValue({ status: "saved", versionId: "v2" });
  const compiler = {
    compile: vi.fn(async () => ({
      ok: true as const,
      screen: {
        kind: "html" as const,
        html: "<button>Start</button>",
        scripts: [],
        styles: [],
        links: [],
      },
    })),
    inspect: vi.fn(),
    tweak: vi.fn(),
    links: vi.fn(async () => []),
    dispose: vi.fn(),
  };
  const store=createScreenStore();
  if(legacy)store.set({id,rev:1,html:source.files["index.html"]});
  return createHandEditing({
    roomId: "room",
    access,
    store,
    compiler,
    api: () => null,
    runtimeBundle: async () => "",
    loadLegacy: async () => null,
  });
}
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
it("wakes without writes and saves an edited draft against its loaded version", async () => {
  vi.useFakeTimers();
  const editing = setup();
  await editing.live.wake(id);
  const draft = editing.drafts.get(id)!;
  expect(draft).toBeDefined();
  expect(actions.save).not.toHaveBeenCalled();
  draft.replace({ "index.html": "<button>Changed</button>" });
  await vi.advanceTimersByTimeAsync(2000);
  expect(actions.save).toHaveBeenCalledWith(
    expect.objectContaining({
      baseVersionId: "v1",
      files: { "index.html": "<button>Changed</button>" },
    }),
  );
  expect(draft.getState().status).toBe("clean");
  editing.live.dispose();
  draft.dispose();
});
it("provides an exportable read-only draft without a persistence target", async () => {
  const editing = setup("view");
  await editing.live.wake(id);
  const draft = editing.drafts.get(id)!;
  expect(draft.getState().source).toEqual(source);
  expect(editing.canEdit(draft)).toBe(false);
  await draft.flush();
  expect(actions.save).not.toHaveBeenCalled();
  editing.live.dispose();
  draft.dispose();
});
it("forgets a picked element when its frame sleeps, preserving no stale pick on reopen",async()=>{
 const editing=setup();await editing.live.wake(id);
 const frame={postMessage:vi.fn()};editing.live.attachFrame(frame as unknown as Window);
 const send=(data:object)=>editing.live.handleMessage({source:frame,data:{source:"orion-frame",...data}});
 send({type:"ready"});editing.live.setPickEnabled(true);
 const epoch=frame.postMessage.mock.calls.at(-1)![0].epoch;
 send({type:"picked",epoch,src:`index.html:0:${source.files["index.html"].length}`,label:"Start"});
 expect(editing.getPicked()?.label).toBe("Start");
 editing.live.dispose();expect(editing.getPicked()).toBeNull();editing.drafts.get(id)?.dispose();
});

it("stores computed values on the pick and clearPicked forgets it and notifies",async()=>{
 const editing=setup();await editing.live.wake(id);
 const frame={postMessage:vi.fn()};editing.live.attachFrame(frame as unknown as Window);
 const send=(data:object)=>editing.live.handleMessage({source:frame,data:{source:"orion-frame",...data}});
 send({type:"ready"});editing.live.setPickEnabled(true);
 const epoch=frame.postMessage.mock.calls.at(-1)![0].epoch;
 const computed={fontFamily:"Inter",fontSize:"16px",fontWeight:"400",color:"red",backgroundColor:"blue",width:"1px",height:"1px",padding:"0px",gap:"0px",borderRadius:"0px",display:"block"};
 send({type:"picked",epoch,src:`index.html:0:${source.files["index.html"].length}`,label:"Start",computed});
 expect(editing.getPicked()?.computed).toEqual(computed);
 const listener=vi.fn();editing.subscribe(listener);
 editing.clearPicked();
 expect(editing.getPicked()).toBeNull();
 expect(listener).toHaveBeenCalled();
 editing.live.dispose();editing.drafts.get(id)?.dispose();
});

it("enables snapshots only after a legacy source has been saved as a versioned screen",async()=>{
 const editing=setup("edit",true);await editing.live.wake(id);
 const frame={postMessage:vi.fn()};editing.live.attachFrame(frame as unknown as Window);
 const send=(data:object)=>editing.live.handleMessage({source:frame,data:{source:"orion-frame",...data}});
 send({type:"ready"});const draft=editing.drafts.get(id)!;
 draft.replace({"index.html":"<button>Changed</button>"});await draft.flush();
 const sleeping=editing.live.sleep();
 expect(frame.postMessage.mock.calls.some(([value])=>value.type==="snapshot")).toBe(true);
 send({type:"snapshot",html:"<button>Changed</button>"});await sleeping;draft.dispose();editing.live.dispose();
});

async function running() {
 const editing=setup();await editing.live.wake(id);
 const frame={postMessage:vi.fn()};editing.live.attachFrame(frame as unknown as Window);
 const send=(data:object)=>editing.live.handleMessage({source:frame,data:{source:"orion-frame",...data}});
 send({type:"ready"});
 const pick=()=>{
  editing.live.setPickEnabled(true);
  const epoch=frame.postMessage.mock.calls.at(-1)![0].epoch;
  send({type:"picked",epoch,src:`index.html:0:${source.files["index.html"].length}`,label:"Start"});
 };
 return {editing,frame,send,pick};
}

it("treats a pick as valid only for the awake screen and the draft revision on screen",async()=>{
 const {editing,pick}=await running();
 expect(editing.getValidPick()).toBeNull();
 pick();expect(editing.getValidPick()?.label).toBe("Start");
 editing.drafts.get(id)!.replace({"index.html":"<button>Changed</button>"});
 expect(editing.getPicked()).not.toBeNull();expect(editing.getValidPick()).toBeNull();
 editing.live.dispose();editing.drafts.get(id)?.dispose();
});

it("forgets the pick when the frame reports a deselection",async()=>{
 const {editing,pick,send}=await running();
 pick();send({type:"deselected"});
 expect(editing.getPicked()).toBeNull();
 editing.live.dispose();editing.drafts.get(id)?.dispose();
});

it("hands the live frame's zoom and pinch to the board's handler, once one is set",async()=>{
 const {editing,send}=await running();
 send({type:"zoom",x:1,y:2,deltaY:-3});
 const onZoom=vi.fn();
 editing.setFrameZoom(onZoom);
 send({type:"zoom",x:1,y:2,deltaY:-3});
 send({type:"pinch",x:4,y:5,scale:2});
 editing.setFrameZoom(null);
 send({type:"zoom",x:1,y:2,deltaY:-3});
 expect(onZoom.mock.calls).toEqual([[{x:1,y:2,deltaY:-3}],[{x:4,y:5,scale:2}]]);
 editing.drafts.get(id)?.dispose();editing.live.dispose();
});

it("uses the frame's Escape to clear a valid pick without sleeping, then sleeps on the next",async()=>{
 const {editing,frame,pick,send}=await running();
 pick();
 send({type:"escape"});
 expect(editing.getPicked()).toBeNull();
 expect(frame.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({type:"clear-selection"}),"*");
 expect(editing.live.getState().phase).toBe("running");
 send({type:"escape"});
 await vi.waitFor(()=>expect(editing.live.getState().phase).toBe("asleep"));
 editing.drafts.get(id)?.dispose();editing.live.dispose();
});

it("sleeps on the frame's Escape when the pick is stale",async()=>{
 const {editing,pick,send}=await running();
 pick();editing.drafts.get(id)!.replace({"index.html":"<button>Changed</button>"});
 send({type:"escape"});
 await vi.waitFor(()=>expect(editing.live.getState().phase).toBe("asleep"));
 editing.drafts.get(id)?.dispose();editing.live.dispose();
});

it("holds an edited element to select again once, until its pick comes back",async()=>{
 const {editing,pick}=await running();
 const listener=vi.fn();editing.subscribe(listener);
 expect(editing.hasReselect()).toBe(false);expect(editing.takeReselect()).toBeNull();
 editing.setReselect("index.html:0:30");
 expect(editing.hasReselect()).toBe(true);expect(listener).toHaveBeenCalled();
 expect(editing.takeReselect()).toBe("index.html:0:30");
 expect(editing.takeReselect()).toBeNull();
 expect(editing.hasReselect()).toBe(true);
 pick();expect(editing.hasReselect()).toBe(false);
 editing.live.dispose();editing.drafts.get(id)?.dispose();
});

it("gives up on selecting again after a wait, and when the screen sleeps or fails",async()=>{
 vi.useFakeTimers();
 const {editing}=await running();
 editing.setReselect("index.html:0:30");editing.takeReselect();
 await vi.advanceTimersByTimeAsync(RESELECT_WAIT_MS);
 expect(editing.hasReselect()).toBe(false);
 editing.setReselect("index.html:0:30");editing.setReselect(null);expect(editing.hasReselect()).toBe(false);
 editing.setReselect("index.html:0:30");
 editing.live.dispose();expect(editing.hasReselect()).toBe(false);
 editing.drafts.get(id)?.dispose();
});

it("drops a pending reselect when another screen wakes, and never selects in it",async()=>{
 const {editing,frame,pick}=await running();
 pick();editing.setReselect("index.html:0:30");
 expect(editing.hasReselect()).toBe(true);
 const other="ds-e5000000-0000-4000-8000-000000000002";
 const wake=editing.live.wake(other);
 await wake;
 expect(editing.hasReselect()).toBe(false);
 expect(editing.takeReselect()).toBeNull();
 expect(frame.postMessage.mock.calls.some(([m])=>m.type==="select-element")).toBe(false);
 editing.live.dispose();editing.drafts.get(id)?.dispose();editing.drafts.get(other)?.dispose();
});

it("keeps a pending reselect across the recompile of the same screen, and gives up if it never finishes",async()=>{
 vi.useFakeTimers();
 const {editing}=await running();
 editing.setReselect("index.html:0:30");
 editing.drafts.get(id)!.replace({"index.html":"<button>Changed</button>"});
 const draft=editing.drafts.get(id)!;
 editing.live.previewDraft(id,draft.getState().source,draft.getState().revision,"tweak");
 await vi.advanceTimersByTimeAsync(100);
 expect(editing.live.getState().phase).toBe("loading");
 expect(editing.hasReselect()).toBe(true);
 await vi.advanceTimersByTimeAsync(RESELECT_COMPILE_WAIT_MS);
 expect(editing.hasReselect()).toBe(false);
 editing.live.dispose();draft.dispose();
});

it("ignores a repeated identical picked message so a flood cannot re-inspect",async()=>{
 const {editing,frame,send}=await running();
 editing.live.setPickEnabled(true);
 const epoch=frame.postMessage.mock.calls.at(-1)![0].epoch;
 const computed={fontFamily:"Inter",fontSize:"16",fontWeight:"400",color:"rgb(0, 0, 0)",backgroundColor:"rgb(1, 1, 1)",width:"1",height:"1",padding:"0",gap:"0",borderRadius:"0",display:"block"};
 const message={type:"picked",epoch,src:`index.html:0:${source.files["index.html"].length}`,label:"Start",computed};
 send(message);
 const first=editing.getPicked();
 const listener=vi.fn();editing.subscribe(listener);
 for(let i=0;i<5;i++)send({...message,computed:{...computed}});
 expect(editing.getPicked()).toBe(first);
 expect(listener).not.toHaveBeenCalled();
 // A different reading is a real change.
 send({...message,computed:{...computed,fontSize:"18"}});
 expect(editing.getPicked()).not.toBe(first);
 // An identical reading again changes nothing in the store, but is still reported as a re-pick, on its own channel.
 const repicked=vi.fn();const stop=editing.subscribeRepick(repicked);
 send({...message,computed:{...computed,fontSize:"18"}});
 expect(repicked).toHaveBeenCalledTimes(1);
 stop();send({...message,computed:{...computed,fontSize:"18"}});
 expect(repicked).toHaveBeenCalledTimes(1);
 // After a deselect the same element can be picked again.
 editing.clearPicked();send(message);
 expect(editing.getPicked()?.src).toBe(message.src);
 editing.live.dispose();editing.drafts.get(id)?.dispose();
});
