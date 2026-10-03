import { Link } from "react-router-dom";
import { Gear, SignOut } from "@phosphor-icons/react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";

export const accountMenuPanelClass =
    "w-56 overflow-hidden rounded-[16px] border-transparent bg-white/80 p-1.5 text-[#202020] shadow-[0_2px_4px_0_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.16),inset_0_1px_0_0_#FDFDFD] backdrop-blur-xl";

const accountMenuInnerClass =
    "rounded-[12px] border-b border-black/[0.06]";

const accountMenuItemClass =
    "flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[12.5px] font-medium text-[#202020]/85 transition-colors hover:bg-black/[0.045] focus:bg-black/[0.045] focus:text-[#202020]";

/** The signed-in person's display name and up to two initials. */
export function useAccountIdentity() {
    const { user } = useAuth();
    const displayName: string = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Account";
    const initials = displayName
        .split(" ")
        .map((word) => word[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    return { displayName, initials, email: user?.email ?? "" };
}

/** Account details plus Settings and Sign Out, for a DropdownMenuContent. */
export function AccountMenuBody() {
    const { signOut } = useAuth();
    const { displayName, email } = useAccountIdentity();
    return (
        <>
            <div className={`${accountMenuInnerClass} px-4 pb-3 pt-2`}>
                <p className="truncate text-[10px] font-medium uppercase leading-tight tracking-[0.18em] text-[#7F7F7D]">Account</p>
                <p className="mt-1 truncate text-[13px] font-light leading-tight text-[#202020]">{displayName}</p>
                <p className="mt-0.5 truncate text-[10px] font-normal leading-tight text-black/45">{email}</p>
            </div>
            <div className="space-y-0.5 px-1 pb-1 pt-1">
                <DropdownMenuItem asChild>
                    <Link to="/settings" className={accountMenuItemClass}>
                        <Gear weight="light" size={15} className="shrink-0 text-[#202020]/70" />
                        System Settings
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => signOut()}
                    className={`${accountMenuItemClass} text-[#9B3D3D] hover:bg-[#9B3D3D]/[0.06] focus:bg-[#9B3D3D]/[0.06] hover:text-[#8E2F2F] focus:text-[#8E2F2F]`}
                >
                    <SignOut weight="light" size={15} className="shrink-0" />
                    Sign Out
                </DropdownMenuItem>
            </div>
        </>
    );
}
