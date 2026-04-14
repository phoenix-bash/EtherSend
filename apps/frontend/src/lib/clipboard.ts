export async function copyTextToClipboard(value: string): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Continue to legacy fallback.
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";

    document.body.appendChild(textarea);

    const previousSelection = document.getSelection();
    const selectedRanges: Range[] = [];
    if (previousSelection) {
      for (let index = 0; index < previousSelection.rangeCount; index += 1) {
        const range = previousSelection.getRangeAt(index);
        selectedRanges.push(range.cloneRange());
      }
    }

    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);

    if (previousSelection) {
      previousSelection.removeAllRanges();
      selectedRanges.forEach((range) => {
        previousSelection.addRange(range);
      });
    }

    return copied;
  } catch {
    return false;
  }
}
