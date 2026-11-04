import { Card, CardContent } from "@/components/ui/card";
import { WorkspaceForm } from "@/components/workspace-form";

export const metadata = { title: "New workspace" };

export default function Onboarding() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="page-title">What are you aiming for?</h1>
      <p className="mb-6 mt-1 subtle">A workspace holds one career search: its employers, research, contacts and applications. You can create as many as you need.</p>
      <Card>
        <CardContent className="pt-5">
          <WorkspaceForm onboarding />
        </CardContent>
      </Card>
    </div>
  );
}
