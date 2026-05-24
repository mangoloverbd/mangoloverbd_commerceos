import { TextEffect } from "@/components/ui/text-effect";

const animatedTextVariants = {
  container: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.065 },
    },
  },
  item: {
    hidden: { opacity: 0, y: 10, filter: "blur(7px)" },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: { duration: 0.42, ease: "easeOut" },
    },
  },
};

export function AnimatedText({
  children,
  className,
  as = "span",
  per = "word",
  delay = 0.1,
}: {
  children: string;
  className?: string;
  as?: "span" | "p" | "h1" | "h2" | "h3";
  per?: "word" | "char";
  delay?: number;
}) {
  return (
    <TextEffect
      key={children}
      as={as}
      per={per}
      delay={delay}
      variants={animatedTextVariants}
      className={className}
    >
      {children}
    </TextEffect>
  );
}
