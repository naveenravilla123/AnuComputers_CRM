import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"Anu Computers | Command Center",description:"Sales, service, inventory and billing in one beautiful workspace"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
