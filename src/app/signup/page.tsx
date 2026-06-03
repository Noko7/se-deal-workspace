import { Suspense } from "react";
import { SignupForm } from "@/components/signup-form";

export const metadata = {
  title: "Sign up · SE Deal Workspace",
};

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
