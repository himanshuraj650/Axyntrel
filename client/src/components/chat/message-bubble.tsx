import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Flame, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/hooks/use-chat";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!message.expiresAt) return;

    const calculateTimeLeft = () => {
      const remaining = Math.max(0, message.expiresAt! - Date.now());
      setTimeLeft(Math.ceil(remaining / 1000));
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);
    
    return () => clearInterval(interval);
  }, [message.expiresAt]);

  const isUrgent = timeLeft !== null && timeLeft <= 5;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, filter: "blur(4px)" }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={cn(
        "flex w-full mt-4",
        message.isMine ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "relative max-w-[85%] md:max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words",
          message.isMine
            ? "bg-primary text-primary-foreground rounded-br-sm shadow-[0_0_15px_rgba(16,185,129,0.15)]"
            : "bg-secondary text-secondary-foreground rounded-bl-sm border border-border"
        )}
      >
        {message.text}
        
        {message.expiresAt && (
          <div 
            className={cn(
              "absolute -bottom-5 flex items-center gap-1 text-xs font-mono font-medium",
              message.isMine ? "right-1 text-muted-foreground" : "left-1 text-muted-foreground",
              isUrgent && "text-destructive animate-pulse"
            )}
          >
            {isUrgent ? <Flame className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
            {timeLeft}s
          </div>
        )}
      </div>
    </motion.div>
  );
}
