import { useState } from "react";
import { useLocation } from "wouter";
import { Shield, Key, Terminal, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateRoom } from "@/hooks/use-rooms";
import { motion } from "framer-motion";

export default function Home() {
  const [, setLocation] = useLocation();
  const createRoom = useCreateRoom();
  const [joinId, setJoinId] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleCreate = async () => {
    setIsGenerating(true);
    try {
      // Create random 8 char ID client side or let server do it.
      // We pass undefined to let server do it, but schema allows input.
      const room = await createRoom.mutateAsync();
      setLocation(`/room/${room.id}`);
    } catch (err) {
      console.error(err);
      setIsGenerating(false);
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinId.trim().length > 0) {
      setLocation(`/room/${joinId.trim()}`);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 bg-grid-pattern relative overflow-hidden">
      
      {/* Ambient glow effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md space-y-8 z-10"
      >
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center p-4 rounded-3xl bg-card border border-border shadow-2xl mb-2">
            <Shield className="w-12 h-12 text-primary animate-pulse-glow rounded-full" />
          </div>
          <h1 className="text-4xl font-bold font-mono tracking-tighter text-foreground">
            Ghost<span className="text-primary">Protocol</span>
          </h1>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto leading-relaxed">
            Peer-to-peer ephemeral chat. Zero knowledge. True end-to-end encryption via Web Crypto API.
          </p>
        </div>

        <div className="bg-card/50 backdrop-blur-xl border border-border/50 rounded-3xl p-6 shadow-2xl space-y-6">
          
          <div className="space-y-4">
            <Button 
              onClick={handleCreate} 
              disabled={isGenerating}
              className="w-full h-14 text-base font-mono font-semibold rounded-xl bg-primary text-primary-foreground shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all"
            >
              {isGenerating ? (
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
              ) : (
                <Key className="w-5 h-5 mr-2" />
              )}
              Initialize Secure Room
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground font-mono">or</span>
              </div>
            </div>

            <form onSubmit={handleJoin} className="flex gap-2">
              <div className="relative flex-1">
                <Terminal className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  value={joinId}
                  onChange={(e) => setJoinId(e.target.value.toUpperCase())}
                  placeholder="ENTER ROOM ID"
                  className="pl-9 h-12 bg-background border-border/50 focus-visible:ring-primary/50 font-mono text-center tracking-widest placeholder:tracking-normal rounded-xl"
                />
              </div>
              <Button type="submit" disabled={!joinId.trim()} size="icon" className="h-12 w-12 rounded-xl shrink-0">
                <ArrowRight className="w-5 h-5" />
              </Button>
            </form>
          </div>

          <div className="pt-4 border-t border-border/30">
            <ul className="text-[11px] font-mono text-muted-foreground/70 space-y-2">
              <li className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-primary/50" />
                Keys generated locally (ECDH P-256)
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-primary/50" />
                No messages stored on servers
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-primary/50" />
                AES-GCM encrypted transport
              </li>
            </ul>
          </div>
        </div>

      </motion.div>
    </div>
  );
}
