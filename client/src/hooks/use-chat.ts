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

export type CallState = {
  isCalling: boolean;
  isReceiving: boolean;
  remoteStream: MediaStream | null;
  localStream: MediaStream | null;
};

export type ConnectionState =
  | "connecting"
  | "waiting_for_peer"
  | "generating_keys"
  | "secured"
  | "disconnected"
  | "error";

export function useChat(roomId: string) {

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");

  const [peerIsTyping, setPeerIsTyping] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [callState, setCallState] = useState<CallState>({
    isCalling: false,
    isReceiving: false,
    remoteStream: null,
    localStream: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const keyPairRef = useRef<CryptoKeyPair | null>(null);
  const sharedSecretRef = useRef<CryptoKey | null>(null);
  const myPublicKeyBase64Ref = useRef<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const createPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        {
          urls: "turn:openrelay.metered.ca:80",
          username: "openrelayproject",
          credential: "openrelayproject"
        }
      ]
    });

    pc.ontrack = (event) => {
      setCallState((prev) => ({
        ...prev,
        remoteStream: event.streams[0]
      }));
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current) {
        wsRef.current.send(JSON.stringify({
          type: "callSignal",
          payload: { candidate: event.candidate }
        }));
      }
    };

    pcRef.current = pc;
  };

  const startCall = async (video: boolean = true) => {

    const stream = await navigator.mediaDevices.getUserMedia({
      video,
      audio: true
    });

    setCallState({
      isCalling: true,
      isReceiving: false,
      localStream: stream,
      remoteStream: null
    });

    createPeerConnection();

    stream.getTracks().forEach(track => {
      pcRef.current?.addTrack(track, stream);
    });

    const offer = await pcRef.current!.createOffer();
    await pcRef.current!.setLocalDescription(offer);

    wsRef.current?.send(JSON.stringify({
      type: "callSignal",
      payload: { offer }
    }));
  };

  const endCall = () => {

    pcRef.current?.close();

    callState.localStream?.getTracks().forEach(track => track.stop());

    setCallState({
      isCalling: false,
      isReceiving: false,
      remoteStream: null,
      localStream: null
    });
  };

  useEffect(() => {

    const interval = setInterval(() => {

      const now = Date.now();

      setMessages(prev => {
        const filtered = prev.filter(
          msg => msg.expiresAt === null || msg.expiresAt > now
        );
        return filtered.length === prev.length ? prev : filtered;
      });

    }, 1000);

    return () => clearInterval(interval);

  }, []);

  const connect = useCallback(async () => {

    if (wsRef.current) return;

    try {

      setConnectionState("generating_keys");

      const keyPair = await generateKeyPair();
      keyPairRef.current = keyPair;

      myPublicKeyBase64Ref.current =
        await exportPublicKey(keyPair.publicKey);

      const protocol =
        window.location.protocol === "https:" ? "wss:" : "ws:";

      const host = window.location.host || "localhost:5000";

      const ws = new WebSocket(`${protocol}//${host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {

        setConnectionState("waiting_for_peer");

        ws.send(JSON.stringify({
          type: "join",
          payload: { roomId }
        }));

        ws.send(JSON.stringify({
          type: "publicKey",
          payload: { roomId, publicKey: myPublicKeyBase64Ref.current }
        }));

      };

      ws.onclose = () => {
        setConnectionState("disconnected");
        wsRef.current = null;
        sharedSecretRef.current = null;
      };

      ws.onerror = () => {
        setConnectionState("error");
        setErrorMsg("WebSocket connection failed");
      };

      ws.onmessage = async (event) => {

        try {

          const parsed = JSON.parse(event.data);

          if (parsed.type === "publicKey") {

            const data = wsEvents.receive.publicKey.parse(parsed.payload);

            if (
              keyPairRef.current &&
              data.publicKey !== myPublicKeyBase64Ref.current
            ) {

              const peerKey = await importPublicKey(data.publicKey);

              const secret = await deriveSecret(
                keyPairRef.current.privateKey,
                peerKey
              );

              sharedSecretRef.current = secret;

              setConnectionState("secured");
            }
          }

          else if (parsed.type === "callSignal") {

            const signal = parsed.payload;

            if (signal.offer) {

              const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: true
              });

              setCallState({
                isCalling: true,
                isReceiving: true,
                localStream: stream,
                remoteStream: null
              });

              createPeerConnection();

              stream.getTracks().forEach(track => {
                pcRef.current?.addTrack(track, stream);
              });

              await pcRef.current!.setRemoteDescription(signal.offer);

              const answer = await pcRef.current!.createAnswer();
              await pcRef.current!.setLocalDescription(answer);

              wsRef.current?.send(JSON.stringify({
                type: "callSignal",
                payload: { answer }
              }));
            }

            if (signal.answer) {
              await pcRef.current?.setRemoteDescription(signal.answer);
            }

            if (signal.candidate) {
              await pcRef.current?.addIceCandidate(signal.candidate);
            }
          }

          else if (parsed.type === "message") {

            const data = wsEvents.receive.message.parse(parsed.payload);

            if (!sharedSecretRef.current) return;

            const decrypted = await decryptMessage(
              data.encryptedPayload,
              data.iv,
              sharedSecretRef.current
            );

            const payload = JSON.parse(decrypted);

            const expiresAt = payload.destructTimer
              ? Date.now() + payload.destructTimer * 1000
              : null;

            const newMessage: ChatMessage = {
              id: `${data.timestamp}-${Math.random()}`,
              text: payload.text,
              image: payload.image,
              isMine: false,
              timestamp: data.timestamp,
              expiresAt
            };

            setMessages(prev => [...prev, newMessage]);
          }

          else if (parsed.type === "typing") {
            const data = wsEvents.receive.typing.parse(parsed.payload);
            setPeerIsTyping(data.isTyping);
          }

        } catch (err) {
          console.error("WS parse error:", err);
        }

      };

    } catch (err) {

      console.error("Crypto init failed", err);

      setConnectionState("error");
      setErrorMsg("Failed to initialize encryption");

    }

  }, [roomId]);

  useEffect(() => {

    connect();

    return () => {
      wsRef.current?.close();
      endCall();
    };

  }, [connect]);

  const sendMessage = async (
    content: { text?: string; image?: string },
    destructTimer: number | null
  ) => {

    if (
      !wsRef.current ||
      !sharedSecretRef.current ||
      wsRef.current.readyState !== WebSocket.OPEN
    ) return false;

    const innerPayload = JSON.stringify({ ...content, destructTimer });

    const { encryptedPayload, iv } = await encryptMessage(
      innerPayload,
      sharedSecretRef.current
    );

    wsRef.current.send(JSON.stringify({
      type: "message",
      payload: { roomId, encryptedPayload, iv }
    }));

    return true;
  };

  const sendTypingStatus = (isTyping: boolean) => {

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {

      wsRef.current.send(JSON.stringify({
        type: "typing",
        payload: { roomId, isTyping }
      }));

    }
  };

  return {
    messages,
    connectionState,
    peerIsTyping,
    errorMsg,
    callState,
    sendMessage,
    sendTypingStatus,
    startCall,
    endCall
  };

}