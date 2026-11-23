import type { CompileResult } from "@meld/screen-runtime";
import type { ScreenSource } from "@meld/screen-runtime/source";
import type { Files, Inspection, Tweak, EditResult } from "@meld/screen-runtime/edit/types";

export type Calls = {
  compile: { args: { source: ScreenSource; tagElements: boolean }; result: CompileResult };
  inspect: { args: { files: Files; src: string }; result: Inspection };
  tweak: { args: { files: Files; src: string; tweak: Tweak }; result: EditResult };
  links: { args: { files: Files }; result: string[] };
};
export type SourceRequest = { [K in keyof Calls]: { id: number; op: K } & Calls[K]["args"] }[keyof Calls];
export type SourceSuccess = { [K in keyof Calls]: { id: number; op: K; result: Calls[K]["result"] } }[keyof Calls];
export type SourceFailure = { id: number; op: keyof Calls; error: string };
export type SourceReply = SourceSuccess | SourceFailure;
