import { motion } from "framer-motion";
import { Chats, Clock, Hash } from "@phosphor-icons/react";

interface SocialInboxData {
  unread: number;
  avgResponseTimeMinutes: number;
  conversationsToday: number;
  byChannel: Record<string, number>;
}

const channelIcons: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
};

export function SocialInboxPanel({ data }: { data: SocialInboxData }) {
  const maxChannel = Math.max(...Object.values(data.byChannel), 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.25 }}
      className="rounded-xl border border-black/[0.06] bg-white p-5"
    >
      <div className="mb-4">
        <p className="text-[8px] font-medium tracking-[0.3em] text-black/40 uppercase">Social</p>
        <p className="text-[15px] font-semibold text-black mt-0.5">Inbox Activity</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center">
          <Chats weight="light" size={18} className="mx-auto text-black/30 mb-1" />
          <p className="text-[16px] font-semibold text-black tabular-nums">{data.unread}</p>
          <p className="text-[9px] text-black/40">Unread</p>
        </div>
        <div className="text-center">
          <Clock weight="light" size={18} className="mx-auto text-black/30 mb-1" />
          <p className="text-[16px] font-semibold text-black tabular-nums">{data.avgResponseTimeMinutes}m</p>
          <p className="text-[9px] text-black/40">Avg Response</p>
        </div>
        <div className="text-center">
          <Hash weight="light" size={18} className="mx-auto text-black/30 mb-1" />
          <p className="text-[16px] font-semibold text-black tabular-nums">{data.conversationsToday}</p>
          <p className="text-[9px] text-black/40">Today</p>
        </div>
      </div>

      <div className="space-y-2">
        {Object.entries(data.byChannel).map(([channel, count]) => (
          <div key={channel} className="flex items-center gap-2">
            <span className="text-[10px] text-black/50 w-16">{channelIcons[channel] || channel}</span>
            <div className="flex-1 h-1.5 bg-black/[0.04] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#232323] rounded-full transition-all"
                style={{ width: `${(count / maxChannel) * 100}%` }}
              />
            </div>
            <span className="text-[10px] font-medium text-black tabular-nums w-6 text-right">{count}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
