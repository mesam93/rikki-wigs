import { Redirect } from "wouter";

// Account creation happens through the same Google journey as sign-in.
export function ClientSignUp() {
  return <Redirect to="/sign-in" replace />;
}
