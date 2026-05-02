"use client"

import * as React from "react"
import { useState, useEffect, useRef } from "react"
import { Send } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { cn } from "@/lib/utils"

const PLACEHOLDERS = [
  "How many orders are pending?",
  "Show orders sent to Steadfast",
  "What's the total revenue?",
  "Which orders have notes?",
  "Find cancelled orders",
  "Summarize today's orders",
]

interface AIChatInputProps {
  onSend?: (message: string) => void
  disabled?: boolean
}

const AIChatInput = ({ onSend, disabled }: AIChatInputProps) => {
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [showPlaceholder, setShowPlaceholder] = useState(true)
  const [isActive, setIsActive] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isActive || inputValue) return

    const interval = setInterval(() => {
      setShowPlaceholder(false)
      setTimeout(() => {
        setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length)
        setShowPlaceholder(true)
      }, 400)
    }, 3000)

    return () => clearInterval(interval)
  }, [isActive, inputValue])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        if (!inputValue) setIsActive(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [inputValue])

  const handleActivate = () => setIsActive(true)

  const handleSend = () => {
    if (!inputValue.trim() || disabled) return
    onSend?.(inputValue.trim())
    setInputValue("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const placeholderContainerVariants = {
    initial: {},
    animate: { transition: { staggerChildren: 0.025 } },
    exit: { transition: { staggerChildren: 0.015, staggerDirection: -1 } },
  }

  const letterVariants = {
    initial: {
      opacity: 0,
      filter: "blur(12px)",
      y: 10,
    },
    animate: {
      opacity: 1,
      filter: "blur(0px)",
      y: 0,
      transition: {
        opacity: { duration: 0.25 },
        filter: { duration: 0.4 },
        y: { type: "spring" as const, stiffness: 80, damping: 20 },
      },
    },
    exit: {
      opacity: 0,
      filter: "blur(12px)",
      y: -10,
      transition: {
        opacity: { duration: 0.2 },
        filter: { duration: 0.3 },
        y: { type: "spring" as const, stiffness: 80, damping: 20 },
      },
    },
  }

  return (
    <div className="w-full flex justify-center" ref={wrapperRef}>
      <div
        className="w-full max-w-3xl rounded-2xl border border-black/[0.08] bg-white overflow-hidden"
        onClick={handleActivate}
        style={{ cursor: isActive ? "default" : "pointer" }}
      >
        <div className="flex flex-col h-full px-4">
          {/* Input Row */}
          <div className="flex items-center gap-2 h-[56px]">
            {/* Text Input & Placeholder */}
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 border-0 outline-none rounded-md py-2 text-base bg-transparent w-full font-normal focus:ring-0 focus:outline-none"
                style={{ position: "relative", zIndex: 1 }}
                onFocus={handleActivate}
              />
              <div className="absolute inset-0 flex items-center pointer-events-none">
                <AnimatePresence mode="wait">
                  {showPlaceholder && !isActive && !inputValue && (
                    <motion.span
                      key={placeholderIndex}
                      variants={placeholderContainerVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      className="text-black text-base flex"
                    >
                      {PLACEHOLDERS[placeholderIndex]
                        .split("")
                        .map((char, i) => (
                          <motion.span key={i} variants={letterVariants}>
                            {char === " " ? "\u00A0" : char}
                          </motion.span>
                        ))}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <button
              className={cn(
                "p-2 rounded-lg transition-colors",
                inputValue.trim() && !disabled
                  ? "bg-black text-white hover:bg-black/80"
                  : "bg-black/5 text-black"
              )}
              onClick={(e) => {
                e.stopPropagation()
                handleSend()
              }}
              disabled={!inputValue.trim() || disabled}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export { AIChatInput }
