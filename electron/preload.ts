import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { EVENT_CHANNELS, INVOKE_CHANNELS } from "@shared/ipc";

const invokeAllowed = new Set<string>(INVOKE_CHANNELS);
const eventsAllowed = new Set<string>(EVENT_CHANNELS);

contextBridge.exposeInMainWorld("investa", {
  platform: process.platform,
  invoke: (channel: string, args?: unknown) => {
    if (!invokeAllowed.has(channel)) return Promise.reject(new Error(`Canal não permitido: ${channel}`));
    return ipcRenderer.invoke(channel, args);
  },
  on: (event: string, callback: (payload: unknown) => void) => {
    if (!eventsAllowed.has(event)) return () => undefined;
    const listener = (_e: IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on(event, listener);
    return () => {
      ipcRenderer.removeListener(event, listener);
    };
  },
});
