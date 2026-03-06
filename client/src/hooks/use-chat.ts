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
    localStream: null
  });

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const keyPairRef = useRef<CryptoKeyPair | null>(null);
  const sharedSecretRef = useRef<CryptoKey | null>(null);
  const myPublicKeyBase64Ref = useRef<string | null>(null);

  const pendingCandidates = useRef<RTCIceCandidate[]>([]);

  /* AUTO DELETE */

  useEffect(() => {

    const interval = setInterval(() => {

      const now = Date.now();

      setMessages(prev =>
        prev.filter(m => m.expiresAt === null || m.expiresAt > now)
      );

    }, 1000);

    return () => clearInterval(interval);

  }, []);

  /* WEBRTC */

  const createPeerConnection = () => {

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
      ]
    });

    pc.ontrack = (event) => {

      console.log("Remote stream received");

      if (event.streams && event.streams[0]) {

        setCallState(prev => ({
          ...prev,
          remoteStream: event.streams[0]
        }));

      }

    };

    pc.onicecandidate = (event) => {

      if (event.candidate && wsRef.current) {

        wsRef.current.send(JSON.stringify({
          type: "callSignal",
          payload: {
            candidate: event.candidate,
            roomId
          }
        }));

      }

    };

    pcRef.current = pc;

  };

  /* START CALL */

  const startCall = async (video = true) => {

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
      payload: { offer, roomId, video }
    }));

  };

  /* END CALL */

  const endCall = () => {

    pcRef.current?.close();

    callState.localStream?.getTracks().forEach(t => t.stop());

    setCallState({
      isCalling: false,
      isReceiving: false,
      remoteStream: null,
      localStream: null
    });

  };

  /* WEBSOCKET */

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

      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

      wsRef.current = ws;

      ws.onopen = () => {

        setConnectionState("waiting_for_peer");

        ws.send(JSON.stringify({
          type: "join",
          payload: { roomId }
        }));

        ws.send(JSON.stringify({
          type: "publicKey",
          payload: {
            roomId,
            publicKey: myPublicKeyBase64Ref.current
          }
        }));

      };

      ws.onmessage = async (event) => {

        const parsed = JSON.parse(event.data);

        /* CALL SIGNAL */

        if (parsed.type === "callSignal") {

          const signal = parsed.payload;

          if (signal.offer) {

            createPeerConnection();

            const stream = await navigator.mediaDevices.getUserMedia({
              video: signal.video,
              audio: true
            });

            setCallState({
              isCalling: true,
              isReceiving: true,
              localStream: stream,
              remoteStream: null
            });

            stream.getTracks().forEach(track => {
              pcRef.current?.addTrack(track, stream);
            });

            await pcRef.current!.setRemoteDescription(signal.offer);

            const answer = await pcRef.current!.createAnswer();

            await pcRef.current!.setLocalDescription(answer);

            wsRef.current?.send(JSON.stringify({
              type: "callSignal",
              payload: { answer, roomId }
            }));

          }

          if (signal.answer) {

            await pcRef.current?.setRemoteDescription(signal.answer);

          }

          if (signal.candidate) {

            try {

              await pcRef.current?.addIceCandidate(signal.candidate);

            } catch {

              console.log("ICE ignored");

            }

          }

        }

      };

    } catch (err) {

      console.error(err);

      setConnectionState("error");

    }

  }, [roomId]);

  useEffect(() => {

    connect();

    return () => {
      wsRef.current?.close();
      endCall();
    };

  }, [connect]);

  return {
    messages,
    connectionState,
    peerIsTyping,
    errorMsg,
    callState,
    sendMessage: () => {},
    sendTypingStatus: () => {},
    startCall,
    endCall
  };

}