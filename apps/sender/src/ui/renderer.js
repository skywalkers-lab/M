let recording = false;
const $ = (id) => document.getElementById(id);

$("connectBtn").onclick = async () => {
  await window.senderApi.connect($("relayUrl").value, Number($("udpPort").value));
};

$("createRoomBtn").onclick = async () => {
  await window.senderApi.createRoom({
    slug: $("slug").value,
    displayName: $("displayName").value,
    driverName: $("driverName").value,
    roomPassword: $("password").value,
    engineerAccessCode: $("accessCode").value
  });
};

$("recordBtn").onclick = async () => {
  recording = !recording;
  await window.senderApi.setRecording(recording);
  $("recordBtn").innerText = recording ? "Stop Recording" : "Start Recording";
};

window.senderApi.onState((state) => {
  $("status").innerText = `UDP:${state.udpConnected ? "ON" : "OFF"} Relay:${state.relayConnected ? "ON" : "OFF"}\nRoom:${state.roomId ?? "-"}\nPackets:${state.packetCount} Rate:${state.eventRate}/s Bitrate:${state.bitrateKbps}kbps\nLast:${state.lastPacketAt ? new Date(state.lastPacketAt).toLocaleTimeString() : "-"}`;
  $("logs").innerText = state.log.join("\n");
});
