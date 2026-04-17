import type { ReactNode } from "react";
import { useWebBridge } from "./WebBridgeProvider";
import { WebBridgeSetupDialog } from "./WebBridgeSetupDialog";

type WebBridgeGateProps = {
  children: ReactNode;
};

export function WebBridgeGate({ children }: WebBridgeGateProps) {
  const { setupRequired } = useWebBridge();

  if (setupRequired) {
    return <WebBridgeSetupDialog />;
  }

  return <>{children}</>;
}
