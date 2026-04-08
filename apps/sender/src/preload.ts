import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("senderApi", {
  connect: (relayUrl: string, udpPort: number) => ipcRenderer.invoke("sender.connect", { relayUrl, udpPort }),
  createRoom: (payload: { slug: string; displayName: string; driverName: string; roomPassword: string; engineerAccessCode: string }) =>
    ipcRenderer.invoke("sender.createRoom", payload),
  setRecording: (recording: boolean) => ipcRenderer.invoke("sender.recording", recording),
  onState: (handler: (state: unknown) => void) => ipcRenderer.on("state", (_event, state) => handler(state))
});
