import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "플랜두씨 — 계획과 실제를 잇는 플래너",
  description: "계획, 할 일, 실행 기록, 회고를 한 흐름으로 관리하는 공개 플래너",
  icons: { icon: "/wish-wing-favicon-v2.svg", shortcut: "/wish-wing-favicon-v2.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
