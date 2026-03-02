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
  text: string;
  isMine: boolean;
  timestamp: number;
  expiresAt: number | null; // null means no expiration
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
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [peerIsTyping, setPeerIsTyping] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const keyPairRef = useRef<CryptoKeyPair | null>(null);
  const sharedSecretRef = useRef<CryptoKey | null>(null);
  const myPublicKeyBase64Ref = useRef<string | null>(null);

  // Auto-delete timer loop
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setMessages((prev) => {
        const filtered = prev.filter((msg) => msg.expiresAt === null || msg.expiresAt > now);
        // Only trigger re-render if something was actually removed
        return filtered.length === prev.length ? prev : filtered;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const connect = useCallback(async () => {
    if (wsRef.current) return;

    try {
      setConnectionState("generating_keys");
      // 1. Generate local keys first
      const keyPair = await generateKeyPair();
      keyPairRef.current = keyPair;
      myPublicKeyBase64Ref.current = await exportPublicKey(keyPair.publicKey);

      // 2. Connect WS
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      // Ensure we have a valid host for WebSocket
      const host = window.location.host || "localhost:5000";
      const wsUrl = `${protocol}//${host}/ws`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionState("waiting_for_peer");
        // Send join
        ws.send(JSON.stringify({ type: "join", payload: { roomId } }));
        // Broadcast public key immediately
        ws.send(
          JSON.stringify({
            type: "publicKey",
            payload: { roomId, publicKey: myPublicKeyBase64Ref.current },
          })
        );
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
          
          if (parsed.type === "userJoined") {
            const data = wsEvents.receive.userJoined.parse(parsed.payload);
            if (data.clientsCount > 1) {
              // Peer joined, resend public key so they get it
              ws.send(
                JSON.stringify({
                  type: "publicKey",
                  payload: { roomId, publicKey: myPublicKeyBase64Ref.current },
                })
              );
            }
          } 
          else if (parsed.type === "publicKey") {
            const data = wsEvents.receive.publicKey.parse(parsed.payload);
            // Received peer's public key
            if (keyPairRef.current && data.publicKey !== myPublicKeyBase64Ref.current) {
              const peerKey = await importPublicKey(data.publicKey);
              const secret = await deriveSecret(keyPairRef.current.privateKey, peerKey);
              sharedSecretRef.current = secret;
              setConnectionState("secured");
            }
          } 
          else if (parsed.type === "message") {
            const data = wsEvents.receive.message.parse(parsed.payload);
            
            if (!sharedSecretRef.current) {
              console.warn("Received message but no shared secret derived yet.");
              return;
            }

            // Decrypt the payload
            const decryptedJson = await decryptMessage(
              data.encryptedPayload,
              data.iv,
              sharedSecretRef.current
            );

            // Parse inner payload: { text: "...", destructTimer: 10 }
            const innerPayload = JSON.parse(decryptedJson);
            const expiresAt = innerPayload.destructTimer 
              ? Date.now() + innerPayload.destructTimer * 1000 
              : null;

            const newMessage: ChatMessage = {
              id: `${data.timestamp}-${Math.random().toString(36).substring(7)}`,
              text: innerPayload.text,
              isMine: false,
              timestamp: data.timestamp,
              expiresAt,
            };

            setMessages((prev) => [...prev, newMessage]);
          }
          else if (parsed.type === "typing") {
            const data = wsEvents.receive.typing.parse(parsed.payload);
            setPeerIsTyping(data.isTyping);
          }
          else if (parsed.type === "userLeft") {
            setConnectionState("waiting_for_peer");
            sharedSecretRef.current = null; // Key must be renegotiated
            setPeerIsTyping(false);
          }
          else if (parsed.type === "error") {
            const data = wsEvents.receive.error.parse(parsed.payload);
            setErrorMsg(data.message);
            setConnectionState("error");
          }

        } catch (err) {
          console.error("Failed to handle WS message", err);
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
      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({ type: "leave", payload: { roomId } }));
        wsRef.current.close();
      }
    };
  }, [connect, roomId]);

  const sendMessage = async (text: string, destructTimer: number | null) => {
    if (!wsRef.current || !sharedSecretRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      // 1. Prepare JSON payload
      const innerPayload = JSON.stringify({ text, destructTimer });
      
      // 2. Encrypt
      const { encryptedPayload, iv } = await encryptMessage(innerPayload, sharedSecretRef.current);
      
      // 3. Send over WS
      wsRef.current.send(
        JSON.stringify({
          type: "message",
          payload: { roomId, encryptedPayload, iv }
        })
      );

      // 4. Add to local state immediately
      const expiresAt = destructTimer ? Date.now() + destructTimer * 1000 : null;
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          text,
          isMine: true,
          timestamp: Date.now(),
          expiresAt,
        },
      ]);
      
      return true;
    } catch (err) {
      console.error("Failed to send encrypted message", err);
      return false;
    }
  };

  const sendTypingStatus = (isTyping: boolean) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "typing", payload: { roomId, isTyping } }));
    }
  };

  return {
    messages,
    connectionState,
    peerIsTyping,
    errorMsg,
    sendMessage,
    sendTypingStatus,
  };
}
