export const WEB_LOCAL_PATH_UNSUPPORTED_MESSAGE =
  "Opening local files and folders is not supported in the web UI.";

export function createWebLocalPathUnsupportedError(): Error {
  return new Error(WEB_LOCAL_PATH_UNSUPPORTED_MESSAGE);
}
