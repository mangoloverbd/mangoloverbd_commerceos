import { useQuery } from "@tanstack/react-query";
import { Select, SelectItem } from "@/components/base/select/select";
import { apiFetch } from "@/lib/api";

type StaffMember = {
  user_id: string;
  display_name: string;
};

type StaffSelectProps = {
  value: string | null;
  onChange: (userId: string) => void;
  disabled?: boolean;
  compact?: boolean;
};

export function StaffSelect({ value, onChange, disabled = false, compact = false }: StaffSelectProps) {
  const { data: staff = [] } = useQuery<StaffMember[]>({
    queryKey: ["/api/staff"],
    queryFn: async () => {
      const response = await apiFetch("/api/staff");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Failed to load staff");
      return Array.isArray(body.staff) ? body.staff : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <Select
      aria-label="Telesales staff"
      selectedKey={value}
      onSelectionChange={(key) => onChange(String(key))}
      isDisabled={disabled}
      size={compact ? "sm" : "md"}
      triggerClassName={compact ? "h-8 min-w-0 text-[12px]" : "h-10 min-w-0 text-[13px]"}
    >
      {staff.map((member) => (
        <SelectItem key={member.user_id} id={member.user_id} textValue={member.display_name}>
          {member.display_name}
        </SelectItem>
      ))}
    </Select>
  );
}
