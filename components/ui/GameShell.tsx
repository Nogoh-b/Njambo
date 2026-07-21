"use client";

import type { ReactNode } from "react";
import type { BottomNavKey } from "@/components/ui/BottomNav";
import { BottomNavScene } from "@/components/ui/BottomNavScene";

export interface GameShellProps {
  children: ReactNode;
  active?: BottomNavKey;
  compact?: boolean;
  className?: string;
  contentClassName?: string;
}

/**
 * Contrat commun des hubs Njambo. Il garde le viewport, le scroll et le dock
 * dans un seul shell sans imposer la composition interne de chaque page.
 */
export function GameShell({
  children,
  active,
  compact = false,
  className,
  contentClassName,
}: GameShellProps) {
  return (
    <BottomNavScene
      active={active}
      narrow={compact}
      className={className}
      contentClassName={contentClassName}
    >
      {children}
    </BottomNavScene>
  );
}

