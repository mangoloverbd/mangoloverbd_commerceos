import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ComboboxProps {
  items: {
    value: string;
    label: string;
    price?: number;
  }[];
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  className?: string;
  showPrice?: boolean;
}

export function Combobox({
  items,
  value,
  onValueChange,
  placeholder = "Select an option...",
  emptyMessage = "No items found.",
  className,
  showPrice = false,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const selectedItem = items.find((item) => item.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between text-left font-normal",
            "h-14 bg-[#F8F8F8] border-none rounded-2xl hover:bg-[#F0F0F0]",
            !value && "text-black",
            className
          )}
        >
          <div className="flex items-center gap-2">
            {selectedItem ? (
              <div className="flex items-center gap-2">
                <span className="truncate">{selectedItem.label}</span>
                {showPrice && selectedItem.price && (
                  <span className="text-xs text-black whitespace-nowrap">
                    ৳{selectedItem.price}
                  </span>
                )}
              </div>
            ) : (
              placeholder
            )}
          </div>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command className="w-full">
          <CommandInput 
            placeholder="Search products..." 
            className="h-11 border-none"
          />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.value}
                  value={item.value}
                  onSelect={() => {
                    onValueChange?.(item.value);
                    setOpen(false);
                  }}
                  className="cursor-pointer hover:bg-black/[0.03]"
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <Check
                        className={cn(
                          "h-4 w-4",
                          value === item.value ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span>{item.label}</span>
                    </div>
                    {showPrice && item.price && (
                      <span className="text-xs text-black">৳{item.price}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
