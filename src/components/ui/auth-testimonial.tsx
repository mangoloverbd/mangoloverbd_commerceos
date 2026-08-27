"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion"

const testimonials = [
  {
    quote: "Transformed our entire order management overnight.",
    author: "Nafis Rahman",
    role: "Operations Director",
    company: "Mango Avenue BD",
  },
  {
    quote: "The most elegant commerce solution we've ever used.",
    author: "Maliha Chowdhury",
    role: "Founder",
    company: "Noksha Living",
  },
  {
    quote: "Pure craftsmanship in every single detail.",
    author: "Tahsin Ahmed",
    role: "Head of E-commerce",
    company: "Dhaka Edit",
  },
]

export function AuthTestimonial() {
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const springConfig = { damping: 25, stiffness: 200 }
  const x = useSpring(mouseX, springConfig)
  const y = useSpring(mouseY, springConfig)
  const numberX = useTransform(x, [-200, 200], [-15, 15])
  const numberY = useTransform(y, [-200, 200], [-8, 8])

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      mouseX.set(e.clientX - (rect.left + rect.width / 2))
      mouseY.set(e.clientY - (rect.top + rect.height / 2))
    }
  }

  const goNext = () => setActiveIndex((prev) => (prev + 1) % testimonials.length)

  useEffect(() => {
    const timer = setInterval(goNext, 6000)
    return () => clearInterval(timer)
  }, [])

  const current = testimonials[activeIndex]

  return (
    <div
      ref={containerRef}
      className="relative h-full flex flex-col justify-center px-12 lg:px-16"
      onMouseMove={handleMouseMove}
    >
      {/* Large background number */}
      <motion.div
        className="absolute -left-4 top-1/2 -translate-y-1/2 text-[20rem] font-bold text-black/[0.03] select-none pointer-events-none leading-none tracking-tighter"
        style={{ x: numberX, y: numberY }}
      >
        <AnimatePresence mode="wait">
          <motion.span
            key={activeIndex}
            initial={{ opacity: 0, scale: 0.8, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="block"
          >
            {String(activeIndex + 1).padStart(2, "0")}
          </motion.span>
        </AnimatePresence>
      </motion.div>

      {/* Content */}
      <div className="relative">
        {/* Company badge */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeIndex}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.4 }}
            className="mb-8"
          >
            <span className="inline-flex items-center gap-2 text-[10px] tracking-[0.2em] uppercase text-black/35">
              <span className="w-1 h-1 rounded-full bg-black/30" />
              {current.company}
            </span>
          </motion.div>
        </AnimatePresence>

        {/* Quote */}
        <div className="relative mb-12 min-h-[120px]">
          <AnimatePresence mode="wait">
            <motion.blockquote
              key={activeIndex}
              className="text-[28px] lg:text-[34px] font-extralight text-black/85 leading-[1.2] tracking-[-0.03em]"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {current.quote.split(" ").map((word, i) => (
                <motion.span
                  key={i}
                  className="inline-block mr-[0.25em]"
                  variants={{
                    hidden: { opacity: 0, y: 15 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      transition: { duration: 0.5, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] },
                    },
                    exit: { opacity: 0, y: -8, transition: { duration: 0.2, delay: i * 0.015 } },
                  }}
                >
                  {word}
                </motion.span>
              ))}
            </motion.blockquote>
          </AnimatePresence>
        </div>

        {/* Author */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="flex items-center gap-3"
          >
            <div className="w-6 h-px bg-black/20" />
            <div>
              <p className="text-[13px] font-light text-black/70">{current.author}</p>
              <p className="text-[11px] text-black/35">{current.role}</p>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Progress dots */}
        <div className="flex gap-2 mt-10">
          {testimonials.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              className={`h-px transition-all duration-700 ${
                i === activeIndex ? "w-8 bg-black/40" : "w-4 bg-black/10 hover:bg-black/20"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
