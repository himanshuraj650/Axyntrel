import { useState, useEffect, useRef, useCallback } from "react";
import { wsEvents } from "@shared/routes";
import {
generateKeyPair,
exportPublicKey,
importPublicKey,
deriveSecret,
encryptMessage,
decryptMessage,
} from "@/lib/crypto";

export type ChatMessage = {
id: string;
text?: string;
image?: string;
isMine: boolean;
timestamp: number;
expiresAt: number | null;
};

export type ConnectionState =
| "connecting"
| "waiting_for_peer"
| "generating_keys"
| "secured"
| "disconnected"
| "error";

export function useChat(roomId: string) {

const [messages,setMessages]=useState<ChatMessage[]>([]);
const [connectionState,setConnectionState]=
useState<ConnectionState>("connecting");

const [peerIsTyping,setPeerIsTyping]=useState(false);
const [errorMsg,setErrorMsg]=useState<string|null>(null);

const wsRef=useRef<WebSocket|null>(null);
const keyPairRef=useRef<CryptoKeyPair|null>(null);
const sharedSecretRef=useRef<CryptoKey|null>(null);
const myPublicKeyBase64Ref=useRef<string|null>(null);

/* AUTO DELETE */

useEffect(()=>{

const interval=setInterval(()=>{

const now=Date.now();

setMessages(prev=>
prev.filter(msg=>
msg.expiresAt===null||msg.expiresAt>now
)
);

},1000);

return()=>clearInterval(interval);

},[]);

/* CONNECT */

const connect=useCallback(async()=>{

if(wsRef.current) return;

try{

setConnectionState("generating_keys");

const keyPair=await generateKeyPair();
keyPairRef.current=keyPair;

myPublicKeyBase64Ref.current=
await exportPublicKey(keyPair.publicKey);

const protocol=
window.location.protocol==="https:"?"wss:":"ws:";

const ws=new WebSocket(
`${protocol}//${window.location.host}/ws`
);

wsRef.current=ws;

ws.onopen=()=>{

setConnectionState("waiting_for_peer");

ws.send(JSON.stringify({
type:"join",
payload:{roomId}
}));

ws.send(JSON.stringify({
type:"publicKey",
payload:{
roomId,
publicKey:myPublicKeyBase64Ref.current
}
}));

};

ws.onmessage=async(event)=>{

const parsed=JSON.parse(event.data);

/* USER JOIN */

if(parsed.type==="userJoined"){

const data=wsEvents.receive.userJoined.parse(parsed.payload);

if(data.clientsCount>1){

ws.send(JSON.stringify({
type:"publicKey",
payload:{
roomId,
publicKey:myPublicKeyBase64Ref.current
}
}));

}

}

/* KEY EXCHANGE */

else if(parsed.type==="publicKey"){

const data=wsEvents.receive.publicKey.parse(parsed.payload);

if(
keyPairRef.current &&
data.publicKey!==myPublicKeyBase64Ref.current
){

const peerKey=await importPublicKey(data.publicKey);

const secret=await deriveSecret(
keyPairRef.current.privateKey,
peerKey
);

sharedSecretRef.current=secret;

setConnectionState("secured");

}

}

/* MESSAGE */

else if(parsed.type==="message"){

const data=wsEvents.receive.message.parse(parsed.payload);

if(!sharedSecretRef.current) return;

const decryptedJson=await decryptMessage(
data.encryptedPayload,
data.iv,
sharedSecretRef.current
);

const payload=JSON.parse(decryptedJson);

const expiresAt=
payload.destructTimer
?Date.now()+payload.destructTimer*1000
:null;

setMessages(prev=>[
...prev,
{
id:`${data.timestamp}-${Math.random()}`,
text:payload.text,
image:payload.image,
isMine:false,
timestamp:data.timestamp,
expiresAt
}
]);

}

/* TYPING */

else if(parsed.type==="typing"){

const data=wsEvents.receive.typing.parse(parsed.payload);
setPeerIsTyping(data.isTyping);

}

/* USER LEFT */

else if(parsed.type==="userLeft"){

setConnectionState("waiting_for_peer");
sharedSecretRef.current=null;
setPeerIsTyping(false);

}

};

ws.onclose=()=>{

setConnectionState("disconnected");
wsRef.current=null;

};

ws.onerror=()=>{

setConnectionState("error");
setErrorMsg("WebSocket connection failed");

};

}catch(err){

setConnectionState("error");

}

},[roomId]);

useEffect(()=>{

connect();

return()=>{

wsRef.current?.close();

};

},[connect]);

/* SEND MESSAGE */

const sendMessage=async(
content:{text?:string,image?:string},
destructTimer:number|null
)=>{

if(
!wsRef.current||
!sharedSecretRef.current||
wsRef.current.readyState!==WebSocket.OPEN
){
return false;
}

const innerPayload=
JSON.stringify({...content,destructTimer});

const {encryptedPayload,iv}=
await encryptMessage(innerPayload,sharedSecretRef.current);

wsRef.current.send(JSON.stringify({
type:"message",
payload:{roomId,encryptedPayload,iv}
}));

const expiresAt=
destructTimer?Date.now()+destructTimer*1000:null;

setMessages(prev=>[
...prev,
{
id:`local-${Date.now()}`,
...content,
isMine:true,
timestamp:Date.now(),
expiresAt
}
]);

return true;

};

/* TYPING */

const sendTypingStatus=(isTyping:boolean)=>{

if(wsRef.current &&
wsRef.current.readyState===WebSocket.OPEN){

wsRef.current.send(JSON.stringify({
type:"typing",
payload:{roomId,isTyping}
}));

}

};

return{
messages,
connectionState,
peerIsTyping,
errorMsg,
sendMessage,
sendTypingStatus
};

}