import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export function shouldIgnoreEnterSubmit(event: ReactKeyboardEvent<HTMLElement>): boolean {
  if (event.key !== "Enter") return true;
  if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return true;

  const nativeEvent = event.nativeEvent as KeyboardEvent & { isComposing?: boolean };
  if (nativeEvent.isComposing) return true;

  const target = event.target as HTMLElement | null;
  if (!target) return false;

  if (target.closest('[data-enter-submit="ignore"]')) return true;

  const role = target.getAttribute("role") ?? "";
  if (role === "combobox" || role === "listbox") return true;

  if (target.closest(".ant-select")) return true;
  if (target.closest(".ant-select-dropdown")) return true;

  return false;
}

export async function handleEnterToSubmit(
  event: ReactKeyboardEvent<HTMLElement>,
  submit: () => void | Promise<void>
) {
  if (shouldIgnoreEnterSubmit(event)) return;
  event.preventDefault();
  await submit();
}
