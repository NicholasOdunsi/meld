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
import { createHandEditing } from "./hand-editing";
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
