"use client";
import dynamic from "next/dynamic";

const MegaOreV3 = dynamic(() => import("../components/MegaOreV3"), {
  ssr: false,
});

export default function Home() {
  return <MegaOreV3 />;
}
