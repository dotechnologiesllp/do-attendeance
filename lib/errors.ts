// Turns database error codes (raised by the SQL functions) into plain sentences.
export function friendlyError(err: unknown): string {
  const msg = typeof err === "string" ? err : (err as { message?: string })?.message ?? "Something went wrong";
  const [code, a, b] = msg.split(":").map((s) => s.trim());
  switch (code) {
    case "OUTSIDE_RADIUS":
      return `You are ${a} m from the office. Move within ${b} m to punch.`;
    case "LOW_ACCURACY":
      return Number(a) < 0
        ? "Your phone did not report GPS accuracy. Turn on precise location and try again."
        : `GPS accuracy is ${a} m, worse than the ${b} m office radius. Wait a few seconds near a window and retry.`;
    case "TOO_SOON":
      return "You just punched. Wait a few seconds before punching again.";
    case "NO_OFFICE":
      return "No office is assigned to you yet. Ask your admin.";
    case "NO_LOCATION":
      return "Location is missing. Allow location access and try again.";
    case "INACTIVE":
      return "Your account is deactivated. Contact your admin.";
    case "MONTH_LOCKED":
      return msg.replace("MONTH_LOCKED: ", "");
    case "REASON_REQUIRED":
    case "INVALID":
    case "OVERLAP":
    case "OPEN_SESSIONS":
    case "RANGE_TOO_LARGE":
      return msg.slice(code.length + 1).trim() || msg;
    case "NOT_STARTED": case "ALREADY_STARTED": case "ALREADY_ENDED": case "VISIT_OPEN": case "DAY_ENDED":
    case "MOCK_LOCATION": case "ALREADY_PAUSED": case "NOT_PAUSED": case "NOT_FOUND":
      return msg.slice(code.length + 1).trim() || code.replace(/_/g, " ").toLowerCase();
    case "SELFIE_REQUIRED":
      return "Take a selfie to continue.";
    case "ALREADY_DECIDED":
      return "This request has already been decided.";
    case "ALREADY_FINALIZED":
      return "This month is already finalized.";
    case "FORBIDDEN":
      return "You don't have permission to do that.";
    default:
      if (/Invalid login credentials/i.test(msg)) return "Wrong email/phone or password.";
      if (/Failed to fetch|NetworkError/i.test(msg)) return "No internet connection. Try again.";
      return msg;
  }
}
