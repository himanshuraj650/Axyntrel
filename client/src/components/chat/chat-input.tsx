import { useState, useRef, useEffect } from "react";
import { Send, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSendMessage: (text: string, destructTimer: number | null) => void;
  onTyping: (isTyping: boolean) => void;
  disabled?: boolean;
}

const TIMER_OPTIONS = [
  { label: "Off", value: null },
  { label: "10s", value: 10 },
  { label: "30s", value: 30 },
  { label: "1m", value: 60 },
  { label: "5m", value: 300 },
];

export function ChatInput({ onSendMessage, onTyping, disabled }: ChatInputProps) {
  const [text, setText] = useState("");
  const [timer, setTimer] = useState<number | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    
    onTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => onTyping(false), 1500);
  };

  const handleSend = () => {
    if (!text.trim() || disabled) return;
    onSendMessage(text.trim(), timer);
    setText("");
    onTyping(false);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-4 bg-background/80 backdrop-blur-md border-t border-border">
      <div className="max-w-3xl mx-auto relative flex items-end gap-2 bg-card border border-border rounded-2xl p-2 focus-within:ring-1 focus-within:ring-primary/50 transition-all shadow-lg">
        
        <Popover>
          <PopoverTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className={cn(
                "shrink-0 rounded-xl h-10 w-10 text-muted-foreground hover:text-foreground",
                timer !== null && "text-destructive hover:text-destructive bg-destructive/10"
              )}
              disabled={disabled}
              title="Self-destruct timer"
            >
              <Timer className="w-5 h-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start" side="top">
            <div className="space-y-1">
              <h4 className="text-xs font-mono font-bold text-muted-foreground px-2 py-1 uppercase tracking-wider">
                Burn After Read
              </h4>
              {TIMER_OPTIONS.map((opt) => (
                <Button
                  key={opt.label}
                  variant={timer === opt.value ? "secondary" : "ghost"}
                  className="w-full justify-start text-sm"
                  onClick={() => setTimer(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Type an encrypted message..."
          disabled={disabled}
          className="flex-1 max-h-[120px] min-h-[40px] bg-transparent border-0 focus:ring-0 resize-none py-2 px-1 text-[15px] placeholder:text-muted-foreground/50 font-sans disabled:opacity-50 scrollbar-hidden outline-none"
          rows={1}
        />

        <Button 
          onClick={handleSend} 
          disabled={!text.trim() || disabled}
          size="icon"
          className="shrink-0 h-10 w-10 rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20"
        >
          <Send className="w-4 h-4 ml-0.5" />
        </Button>

      </div>
      
      {timer && (
        <div className="max-w-3xl mx-auto mt-2 flex justify-center">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/10 text-destructive text-[10px] font-mono font-bold tracking-widest uppercase animate-pulse">
            <Flame className="w-3 h-3" />
            Messages destroy in {TIMER_OPTIONS.find(t => t.value === timer)?.label}
          </span>
        </div>
      )}
    </div>
  );
}
