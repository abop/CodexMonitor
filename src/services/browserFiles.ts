function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  });
}

export async function pickBrowserImageFiles(): Promise<string[]> {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return [];
  }

  return new Promise<string[]>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;

    let settled = false;
    const settle = (value: string[]) => {
      if (settled) {
        return;
      }
      settled = true;
      window.removeEventListener("focus", handleFocus);
      resolve(value);
    };

    const handleFocus = () => {
      window.setTimeout(() => {
        if (!settled) {
          settle([]);
        }
      }, 300);
    };

    input.addEventListener("change", () => {
      const files = Array.from(input.files ?? []).filter((file) =>
        file.type.startsWith("image/"),
      );
      Promise.all(files.map(readFileAsDataUrl))
        .then((images) => settle(images.filter(Boolean)))
        .catch(() => settle([]));
    });

    window.addEventListener("focus", handleFocus, { once: true });
    input.click();
  });
}
