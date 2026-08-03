"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTarget } from "@/app/actions";

export function DeleteButton({
  target,
  label,
  confirm,
}: {
  target: string;
  label: string;
  confirm: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!window.confirm(confirm)) return;
        start(async () => {
          await deleteTarget(target);
          router.refresh();
        });
      }}
      className="shrink-0 rounded-md border border-line px-2 py-1 text-xs text-faint transition-colors hover:border-danger hover:text-danger active:translate-y-px disabled:opacity-50"
    >
      {pending ? "Deleting…" : label}
    </button>
  );
}
