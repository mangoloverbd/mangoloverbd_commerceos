'use client';
import React, { useState } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Liquid } from '@/components/ui/button-1';

const COLORS = {
    color1: '#FFFFFF',
    color2: '#1E10C5',
    color3: '#9089E2',
    color4: '#FCFCFE',
    color5: '#F9F9FD',
    color6: '#B2B8E7',
    color7: '#0E2DCB',
    color8: '#0017E9',
    color9: '#4743EF',
    color10: '#7D7BF4',
    color11: '#0B06FC',
    color12: '#C5C1EA',
    color13: '#1403DE',
    color14: '#B6BAF6',
    color15: '#C1BEEB',
    color16: '#290ECB',
    color17: '#3F4CC0',
};

interface SyncOrderLiquidButtonProps {
    onClick: () => void;
    loading?: boolean;
    disabled?: boolean;
}

const SyncOrderLiquidButton = ({ onClick, loading = false, disabled = false }: SyncOrderLiquidButtonProps) => {
    const [isHovered, setIsHovered] = useState(false);

    // If loading or disabled, we might want to prevent hover effects or click
    const interactive = !loading && !disabled;

    return (
        <div className="flex justify-center">
            <div
                className={`relative inline-block w-40 h-[3em] mx-auto group dark:bg-black bg-white dark:border-white border-black border-2 rounded-lg 
          ${interactive ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'}`}
            >
                <div className="absolute w-[112.81%] h-[128.57%] top-[8.57%] left-1/2 -translate-x-1/2 filter blur-[19px] opacity-70">
                    <span className="absolute inset-0 rounded-lg bg-[#d9d9d9] filter blur-[6.5px]"></span>
                    <div className="relative w-full h-full overflow-hidden rounded-lg">
                        <Liquid isHovered={isHovered && interactive} colors={COLORS} />
                    </div>
                </div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[40%] w-[92.23%] h-[112.85%] rounded-lg bg-[#010128] filter blur-[7.3px]"></div>
                <div className="relative w-full h-full overflow-hidden rounded-lg">
                    <span className="absolute inset-0 rounded-lg bg-[#d9d9d9]"></span>
                    <span className="absolute inset-0 rounded-lg bg-black"></span>
                    <Liquid isHovered={isHovered && interactive} colors={COLORS} />
                    {[1, 2, 3, 4, 5].map((i) => (
                        <span
                            key={i}
                            className={`absolute inset-0 rounded-lg border-solid border-[3px] border-gradient-to-b from-transparent to-white mix-blend-overlay filter ${i <= 2 ? 'blur-[3px]' : i === 3 ? 'blur-[5px]' : 'blur-[4px]'}`}></span>
                    ))}
                    <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[40%] w-[70.8%] h-[42.85%] rounded-lg filter blur-[15px] bg-[#006]"></span>
                </div>
                <button
                    className="absolute inset-0 rounded-lg bg-transparent cursor-pointer w-full h-full"
                    aria-label="Sync Order"
                    type="button"
                    onClick={interactive ? onClick : undefined}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                    disabled={!interactive}>
                    <span className="flex items-center justify-center px-4 gap-2 rounded-lg group-hover:text-yellow-400 text-white text-sm font-semibold tracking-wide whitespace-nowrap h-full">
                        {loading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-white/70" />
                        ) : (
                            <RefreshCw className={`w-4 h-4 flex-shrink-0 transition-colors ${isHovered ? 'fill-yellow-400 text-yellow-400' : 'fill-white text-white'}`} />
                        )}
                        <span>{loading ? 'Syncing...' : 'Sync Order'}</span>
                    </span>
                </button>
            </div>
        </div>
    );
};

export default SyncOrderLiquidButton;
