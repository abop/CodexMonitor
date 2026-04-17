const IMAGE_ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.bmp,.tiff,.tif,.heic,.heif";

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

export async function pickBrowserImageFiles(): Promise<string[]> {
  if (typeof document === "undefined") {
    return [];
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = IMAGE_ACCEPT;
  input.multiple = true;
  input.style.position = "fixed";
  input.style.left = "-9999px";
  document.body.appendChild(input);

  const files = await new Promise<File[]>((resolve) => {
    let settled = false;
    const finish = (next: File[]) => {
      if (settled) {
        return;
      }
      settled = true;
      window.removeEventListener("focus", onFocus);
      input.remove();
      resolve(next);
    };
    const onFocus = () => {
      window.setTimeout(() => {
        finish(Array.from(input.files ?? []));
      }, 0);
    };

    input.addEventListener(
      "change",
      () => {
        finish(Array.from(input.files ?? []));
      },
      { once: true },
    );
    input.addEventListener(
      "cancel",
      () => {
        finish([]);
      },
      { once: true },
    );
    window.addEventListener("focus", onFocus, { once: true });
    input.click();
  });

  const dataUrls = await Promise.all(files.map(readFileAsDataUrl));
  return dataUrls.filter(Boolean);
}
