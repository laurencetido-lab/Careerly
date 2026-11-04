"use client";
import { useRouter } from "next/navigation";
import { markNotificationsRead } from "@/app/actions/settings";
import { Button } from "./ui/button";

export function MarkAllRead() {
  const router = useRouter();
  return <Button variant="outline" size="sm" onClick={async () => { await markNotificationsRead(); router.refresh(); }}>Mark all as read</Button>;
}
