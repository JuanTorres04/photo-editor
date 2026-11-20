function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const { message } = error as { message: unknown };
    if (typeof message === "string") return message;
  }
  return "";
}

export function getErrorMessage(error: unknown): string {
  const raw = messageOf(error);
  const text = raw.toLowerCase();

  if (text.includes("invalid login credentials"))
    return "Incorrect email or password.";
  if (
    text.includes("already registered") ||
    text.includes("already been registered")
  ) {
    return "An account with that email already exists.";
  }
  if (text.includes("email not confirmed"))
    return "Please confirm your email, then sign in.";
  if (text.includes("rate limit") || text.includes("too many")) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (text.includes("failed to fetch") || text.includes("network")) {
    return "Can't reach the server. Check your connection and try again.";
  }
  return raw || "Something went wrong. Please try again.";
}
