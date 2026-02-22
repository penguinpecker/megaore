"use client";
import dynamic from "next/dynamic";

const MegaOreV2 = dynamic(() => import("../components/MegaOreV2"), {
  ssr: false,
});

export default function Home() {
  return <MegaOreV2 />;
}
